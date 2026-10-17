import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationsGateway } from '../notifications/gateway/notifications.gateway';
import { ChatRepository } from './chat.repository';
import { ChatService, directKeyOf } from './chat.service';

const TENANT = 'tenant-a';
const ME = 'user-me';
const ANA = 'user-ana';
const LUIS = 'user-luis';
const person = (id: string, firstName: string) => ({
  id,
  firstName,
  lastName: 'Test',
});

describe('ChatService', () => {
  let repository: Record<keyof ChatRepository, jest.Mock>;
  let gateway: { emitToUser: jest.Mock };
  let service: ChatService;

  beforeEach(() => {
    repository = {
      people: jest.fn().mockResolvedValue([]),
      activeUsers: jest.fn().mockResolvedValue([person(ANA, 'Ana')]),
      users: jest.fn().mockResolvedValue([]),
      conversationsOf: jest.fn().mockResolvedValue([]),
      unreadTotal: jest.fn().mockResolvedValue(0),
      participants: jest.fn().mockResolvedValue([]),
      participant: jest.fn().mockResolvedValue({ conversationId: 'c1' }),
      lastMessages: jest.fn().mockResolvedValue([]),
      directByKey: jest.fn().mockResolvedValue(null),
      createConversation: jest.fn().mockResolvedValue({ id: 'c1' }),
      messages: jest.fn().mockResolvedValue([]),
      createMessage: jest.fn().mockResolvedValue({ id: 'm1', body: 'Hola' }),
      markRead: jest.fn().mockResolvedValue({ count: 1 }),
    } as never;
    gateway = { emitToUser: jest.fn() };
    service = new ChatService(
      repository as unknown as ChatRepository,
      gateway as unknown as NotificationsGateway,
    );
  });

  it('builds the same key whoever opens the direct conversation', () => {
    expect(directKeyOf(ME, ANA)).toBe(directKeyOf(ANA, ME));
  });

  describe('conversations', () => {
    it('describes each one with its people, what is unread and the last message', async () => {
      const lastMessageAt = new Date('2026-10-13T15:00:00Z');
      repository.conversationsOf.mockResolvedValue([
        {
          id: 'c1',
          kind: 'DIRECT',
          name: null,
          lastMessageAt,
          createdAt: lastMessageAt,
          unread: 2,
        },
      ]);
      repository.participants.mockResolvedValue([
        { conversationId: 'c1', userId: ME, lastReadAt: null },
        { conversationId: 'c1', userId: ANA, lastReadAt: null },
      ]);
      repository.users.mockResolvedValue([
        person(ME, 'Yo'),
        person(ANA, 'Ana'),
      ]);
      repository.lastMessages.mockResolvedValue([
        { id: 'm9', conversationId: 'c1', senderId: ANA, body: 'Dale' },
      ]);

      const [conversation] = await service.conversations(TENANT, ME);

      expect(conversation).toMatchObject({
        id: 'c1',
        kind: 'DIRECT',
        unread: 2,
        participants: [person(ME, 'Yo'), person(ANA, 'Ana')],
        lastMessage: { id: 'm9', body: 'Dale' },
      });
      expect(repository.conversationsOf).toHaveBeenCalledWith(TENANT, ME);
      expect(repository.participants).toHaveBeenCalledWith(TENANT, ['c1']);
      expect(repository.users).toHaveBeenCalledWith(TENANT, [ME, ANA]);
    });
  });

  describe('open', () => {
    it('starts a direct conversation with a coworker and tells both', async () => {
      await service.open(TENANT, ME, { participantIds: [ANA] });

      expect(repository.activeUsers).toHaveBeenCalledWith(TENANT, [ANA]);
      expect(repository.createConversation).toHaveBeenCalledWith({
        tenantId: TENANT,
        kind: 'DIRECT',
        name: null,
        directKey: directKeyOf(ME, ANA),
        createdBy: ME,
        participantIds: [ME, ANA],
      });
      expect(gateway.emitToUser.mock.calls).toEqual([
        [TENANT, ME, 'chat.conversation', { conversationId: 'c1' }],
        [TENANT, ANA, 'chat.conversation', { conversationId: 'c1' }],
      ]);
    });

    it('reopens the direct conversation that already exists', async () => {
      repository.directByKey.mockResolvedValue({ id: 'c-old' });

      await service.open(TENANT, ME, { participantIds: [ANA] });

      expect(repository.createConversation).not.toHaveBeenCalled();
      expect(gateway.emitToUser).not.toHaveBeenCalled();
      expect(repository.conversationsOf).toHaveBeenCalledWith(
        TENANT,
        ME,
        'c-old',
      );
    });

    it('creates a group with a name', async () => {
      repository.activeUsers.mockResolvedValue([
        person(ANA, 'Ana'),
        person(LUIS, 'Luis'),
      ]);

      await service.open(TENANT, ME, {
        participantIds: [ANA, LUIS],
        name: 'Cobranzas',
      });

      expect(repository.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'GROUP',
          name: 'Cobranzas',
          directKey: null,
          participantIds: [ME, ANA, LUIS],
        }),
      );
    });

    it('asks for a name before creating a group', async () => {
      repository.activeUsers.mockResolvedValue([
        person(ANA, 'Ana'),
        person(LUIS, 'Luis'),
      ]);

      await expect(
        service.open(TENANT, ME, { participantIds: [ANA, LUIS] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createConversation).not.toHaveBeenCalled();
    });

    it('does not open a conversation with oneself', async () => {
      await expect(
        service.open(TENANT, ME, { participantIds: [ME] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // Un usuario de otra empresa, dado de baja o inexistente: no aparece
    // entre los activos de esta empresa.
    it('refuses people who are not active users of the company', async () => {
      repository.activeUsers.mockResolvedValue([]);

      await expect(
        service.open(TENANT, ME, { participantIds: ['user-other-tenant'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.activeUsers).toHaveBeenCalledWith(TENANT, [
        'user-other-tenant',
      ]);
      expect(repository.createConversation).not.toHaveBeenCalled();
    });
  });

  describe('a conversation the user is not part of', () => {
    beforeEach(() => repository.participant.mockResolvedValue(null));

    it('cannot be read', async () => {
      await expect(
        service.messages(TENANT, ME, 'c-other', { limit: 50 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.participant).toHaveBeenCalledWith(
        TENANT,
        'c-other',
        ME,
      );
      expect(repository.messages).not.toHaveBeenCalled();
    });

    it('cannot be written to', async () => {
      await expect(
        service.send(TENANT, ME, 'c-other', { body: 'Hola' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.createMessage).not.toHaveBeenCalled();
      expect(gateway.emitToUser).not.toHaveBeenCalled();
    });

    it('cannot be marked as read', async () => {
      await expect(
        service.markRead(TENANT, ME, 'c-other'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.markRead).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('saves the message and tells every participant, without the content', async () => {
      repository.participants.mockResolvedValue([
        { conversationId: 'c1', userId: ME },
        { conversationId: 'c1', userId: ANA },
      ]);

      const message = await service.send(TENANT, ME, 'c1', { body: 'Hola' });

      expect(message).toEqual({ id: 'm1', body: 'Hola' });
      expect(repository.createMessage).toHaveBeenCalledWith({
        tenantId: TENANT,
        conversationId: 'c1',
        senderId: ME,
        body: 'Hola',
      });
      expect(gateway.emitToUser.mock.calls).toEqual([
        [TENANT, ME, 'chat.message', { conversationId: 'c1' }],
        [TENANT, ANA, 'chat.message', { conversationId: 'c1' }],
      ]);
    });
  });

  describe('messages', () => {
    it('pages backwards from a date and says whether there is more', async () => {
      repository.messages.mockResolvedValue([{ id: 'm2' }, { id: 'm1' }]);

      const page = await service.messages(TENANT, ME, 'c1', {
        before: '2026-10-13T15:00:00.000Z',
        limit: 2,
      });

      expect(page).toEqual({
        items: [{ id: 'm2' }, { id: 'm1' }],
        hasMore: true,
      });
      expect(repository.messages).toHaveBeenCalledWith(
        TENANT,
        'c1',
        new Date('2026-10-13T15:00:00.000Z'),
        2,
      );
    });
  });

  it('marks a conversation as read for that user only', async () => {
    await service.markRead(TENANT, ME, 'c1');

    expect(repository.markRead).toHaveBeenCalledWith(TENANT, 'c1', ME);
    expect(gateway.emitToUser).toHaveBeenCalledWith(TENANT, ME, 'chat.read', {
      conversationId: 'c1',
    });
  });

  it('counts what the user has not read yet', async () => {
    repository.unreadTotal.mockResolvedValue(4);

    await expect(service.unread(TENANT, ME)).resolves.toEqual({ unread: 4 });
    expect(repository.unreadTotal).toHaveBeenCalledWith(TENANT, ME);
  });
});
