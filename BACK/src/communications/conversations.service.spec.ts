import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';

const customer = (id: string, firstName: string) => ({
  id,
  customerCode: `CLI-26-${id}`,
  firstName,
  secondFirstName: null,
  lastName: 'López',
  secondLastName: null,
  email: `${firstName.toLowerCase()}@example.com`,
  phone: null,
});

describe('ConversationsService', () => {
  const page = { page: 1, limit: 20 };
  let repository: jest.Mocked<
    Pick<
      ConversationsRepository,
      | 'settings'
      | 'list'
      | 'lastMessages'
      | 'problemGroups'
      | 'customer'
      | 'customers'
      | 'customerIdsMatching'
      | 'threadRefs'
      | 'threadTotal'
      | 'messages'
      | 'notes'
      | 'users'
      | 'createNote'
    >
  >;
  let events: { emit: jest.Mock };
  let service: ConversationsService;

  beforeEach(() => {
    repository = {
      settings: jest.fn().mockResolvedValue({ enabled: true }),
      list: jest.fn().mockResolvedValue([]),
      lastMessages: jest.fn().mockResolvedValue([]),
      problemGroups: jest.fn().mockResolvedValue([]),
      customer: jest.fn().mockResolvedValue(customer('c1', 'María')),
      customers: jest.fn().mockResolvedValue([]),
      customerIdsMatching: jest.fn().mockResolvedValue([]),
      threadRefs: jest.fn().mockResolvedValue([]),
      threadTotal: jest.fn().mockResolvedValue(0),
      messages: jest.fn().mockResolvedValue([]),
      notes: jest.fn().mockResolvedValue([]),
      users: jest.fn().mockResolvedValue([]),
      createNote: jest.fn().mockResolvedValue({ id: 'note-1' }),
    };
    events = { emit: jest.fn() };
    service = new ConversationsService(
      repository as unknown as ConversationsRepository,
      events as unknown as EventEmitter2,
    );
  });

  it('refuses every operation while the center is disabled', async () => {
    repository.settings.mockResolvedValue({ enabled: false } as never);

    await expect(
      service.list('tenant-a', { ...page, onlyProblems: false }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.summary('tenant-a')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(
      service.thread('tenant-a', 'CUSTOMER', 'c1', page),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service.createNote('tenant-a', 'user-1', 'CUSTOMER', 'c1', {
        body: 'x',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.createNote).not.toHaveBeenCalled();
  });

  describe('list', () => {
    it('groups by contact with its name and the last message', async () => {
      const lastAt = new Date('2026-10-10T14:00:00Z');
      repository.list.mockResolvedValue([
        {
          contactType: 'CUSTOMER',
          contactId: 'c1',
          messages: 3,
          notes: 1,
          problems: 1,
          lastAt,
          total: 1,
        },
      ]);
      repository.customers.mockResolvedValue([customer('c1', 'María')]);
      repository.lastMessages.mockResolvedValue([
        {
          id: 'm3',
          contactType: 'CUSTOMER',
          contactId: 'c1',
          subject: 'Factura 001',
          status: 'FAILED',
          createdAt: lastAt,
        },
      ] as never);

      const result = await service.list('tenant-a', {
        ...page,
        onlyProblems: false,
      });

      expect(result).toEqual({
        items: [
          {
            contact: {
              type: 'CUSTOMER',
              id: 'c1',
              code: 'CLI-26-c1',
              name: 'María López',
              email: 'maría@example.com',
              phone: null,
            },
            messages: 3,
            notes: 1,
            problems: 1,
            lastAt,
            lastMessage: {
              id: 'm3',
              subject: 'Factura 001',
              status: 'FAILED',
              createdAt: lastAt,
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(repository.customers).toHaveBeenCalledWith('tenant-a', ['c1']);
      expect(repository.lastMessages).toHaveBeenCalledWith('tenant-a', ['c1']);
    });

    it('searches contacts by name inside the tenant', async () => {
      repository.customerIdsMatching.mockResolvedValue(['c1']);

      await service.list('tenant-a', {
        ...page,
        onlyProblems: true,
        search: 'maria',
      });

      expect(repository.customerIdsMatching).toHaveBeenCalledWith(
        'tenant-a',
        'maria',
      );
      expect(repository.list).toHaveBeenCalledWith(
        'tenant-a',
        expect.objectContaining({
          onlyProblems: true,
          search: 'maria',
          matchingContactIds: ['c1'],
        }),
      );
    });

    it('leaves out a conversation whose contact is not in the tenant', async () => {
      repository.list.mockResolvedValue([
        {
          contactType: 'CUSTOMER',
          contactId: 'other-tenant-customer',
          messages: 1,
          notes: 0,
          problems: 0,
          lastAt: new Date(),
          total: 1,
        },
      ]);

      const result = await service.list('tenant-a', {
        ...page,
        onlyProblems: false,
      });

      expect(result.items).toEqual([]);
    });
  });

  it('counts the conversations and messages with a delivery problem', async () => {
    repository.problemGroups.mockResolvedValue([
      { contactType: 'CUSTOMER', contactId: 'c1', _count: { _all: 2 } },
      { contactType: 'CUSTOMER', contactId: 'c2', _count: { _all: 1 } },
    ] as never);

    await expect(service.summary('tenant-a')).resolves.toEqual({
      problemConversations: 2,
      problemMessages: 3,
    });
    expect(repository.problemGroups).toHaveBeenCalledWith('tenant-a');
  });

  describe('thread', () => {
    it('does not open the conversation of a contact from another tenant', async () => {
      repository.customer.mockResolvedValue(null);

      await expect(
        service.thread('tenant-a', 'CUSTOMER', 'c-other', page),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.customer).toHaveBeenCalledWith('tenant-a', 'c-other');
      expect(repository.threadRefs).not.toHaveBeenCalled();
    });

    it('interleaves messages and notes in order, each note with its author', async () => {
      repository.threadRefs.mockResolvedValue([
        { id: 'n1', kind: 'NOTE' },
        { id: 'm1', kind: 'MESSAGE' },
      ]);
      repository.threadTotal.mockResolvedValue(2);
      repository.messages.mockResolvedValue([
        { id: 'm1', subject: 'Factura 001', status: 'SENT' },
      ] as never);
      repository.notes.mockResolvedValue([
        { id: 'n1', body: 'Paga el viernes', createdBy: 'user-1' },
      ] as never);
      repository.users.mockResolvedValue([
        { id: 'user-1', firstName: 'Juan', lastName: 'Pérez' },
      ]);

      const result = await service.thread('tenant-a', 'CUSTOMER', 'c1', page);

      expect(result.contact.name).toBe('María López');
      expect(result.total).toBe(2);
      expect(result.items).toEqual([
        {
          kind: 'NOTE',
          id: 'n1',
          body: 'Paga el viernes',
          createdBy: 'user-1',
          author: { firstName: 'Juan', lastName: 'Pérez' },
        },
        { kind: 'MESSAGE', id: 'm1', subject: 'Factura 001', status: 'SENT' },
      ]);
      expect(repository.messages).toHaveBeenCalledWith('tenant-a', ['m1']);
      expect(repository.notes).toHaveBeenCalledWith('tenant-a', ['n1']);
      expect(repository.users).toHaveBeenCalledWith('tenant-a', ['user-1']);
    });
  });

  describe('createNote', () => {
    it('saves the note on the contact and leaves an audit record', async () => {
      await service.createNote('tenant-a', 'user-1', 'CUSTOMER', 'c1', {
        body: '  Paga el viernes  ',
      });

      expect(repository.createNote).toHaveBeenCalledWith({
        tenantId: 'tenant-a',
        contactType: 'CUSTOMER',
        contactId: 'c1',
        body: 'Paga el viernes',
        createdBy: 'user-1',
      });
      expect(events.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          tenantId: 'tenant-a',
          userId: 'user-1',
          action: 'note.created',
          resourceId: 'note-1',
        }),
      );
    });

    it('does not write a note on a contact from another tenant', async () => {
      repository.customer.mockResolvedValue(null);

      await expect(
        service.createNote('tenant-a', 'user-1', 'CUSTOMER', 'c-other', {
          body: 'x',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.createNote).not.toHaveBeenCalled();
    });
  });
});
