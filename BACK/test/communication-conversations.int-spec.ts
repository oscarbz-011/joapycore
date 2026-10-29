import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventBus } from '../src/common/events/event-bus';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CommunicationMessageStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConversationsRepository } from '../src/communications/conversations.repository';
import { ConversationsService } from '../src/communications/conversations.service';

const url = process.env.COMMUNICATIONS_TEST_DATABASE_URL;
if (url && !/^\/joapycore_comms_test_[\w-]+$/.test(new URL(url).pathname)) {
  throw new Error(
    'COMMUNICATIONS_TEST_DATABASE_URL debe apuntar a una base aislada joapycore_comms_test_*',
  );
}
const integration = url ? describe : describe.skip;

integration('Communication conversations (isolated PostgreSQL)', () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userId = randomUUID();
  const maria = randomUUID();
  const pedro = randomUUID();
  const foreign = randomUUID();
  const page = { page: 1, limit: 20 };
  let prisma: PrismaService;
  let service: ConversationsService;

  const message = (
    tenantId: string,
    contactId: string,
    subject: string,
    status: CommunicationMessageStatus,
    createdAt: string,
    recipient = 'cliente@example.test',
  ) =>
    prisma.communicationMessage.create({
      data: {
        tenantId,
        entityId: randomUUID(),
        invoiceId: randomUUID(),
        contactType: 'CUSTOMER',
        contactId,
        recipient,
        pdfFileId: randomUUID(),
        identityId: randomUUID(),
        templateVersionId: randomUUID(),
        subject,
        bodyText: 'Adjuntamos la factura.',
        fromEmail: 'no-reply@example.test',
        status,
        idempotencyKey: randomUUID(),
        createdAt: new Date(createdAt),
      },
    });

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    await prisma.$connect();
    service = new ConversationsService(
      new ConversationsRepository(prisma),
      new EventBus(new EventEmitter2()),
    );
    for (const id of [tenantA, tenantB]) {
      await prisma.tenant.create({ data: { id, name: `Conversations ${id}` } });
      await prisma.communicationSettings.create({
        data: { tenantId: id, enabled: true, emailEnabled: true },
      });
    }
    await prisma.user.create({
      data: {
        id: userId,
        tenantId: tenantA,
        email: `${userId}@example.test`,
        passwordHash: 'unused-test-only',
        firstName: 'Juan',
        lastName: 'Pérez',
      },
    });
    await prisma.customer.createMany({
      data: [
        { id: maria, tenantId: tenantA, firstName: 'María', lastName: 'López' },
        { id: pedro, tenantId: tenantA, firstName: 'Pedro', lastName: 'Ruiz' },
        {
          id: foreign,
          tenantId: tenantB,
          firstName: 'Otra',
          lastName: 'Empresa',
        },
      ],
    });
    await message(
      tenantA,
      maria,
      'Factura 001',
      'SENT',
      '2026-10-01T12:00:00Z',
    );
    await message(
      tenantA,
      maria,
      'Factura 002',
      'SENT',
      '2026-10-05T12:00:00Z',
    );
    await message(
      tenantA,
      pedro,
      'Factura 003',
      'FAILED',
      '2026-10-03T12:00:00Z',
      'pedro@example.test',
    );
    await message(
      tenantB,
      foreign,
      'Factura ajena',
      'FAILED',
      '2026-10-09T12:00:00Z',
    );
  });

  afterAll(async () => {
    const tenants = { tenantId: { in: [tenantA, tenantB] } };
    await prisma.communicationNote.deleteMany({ where: tenants });
    await prisma.communicationMessage.deleteMany({ where: tenants });
    await prisma.communicationSettings.deleteMany({ where: tenants });
    await prisma.customer.deleteMany({ where: tenants });
    await prisma.user.deleteMany({ where: tenants });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    });
    await prisma.onModuleDestroy();
  });

  it('lists one conversation per contact, the most recent first', async () => {
    const result = await service.list(tenantA, {
      ...page,
      onlyProblems: false,
    });

    expect(result.total).toBe(2);
    expect(
      result.items.map((item) => [
        item.contact.name,
        item.messages,
        item.problems,
        item.lastMessage?.subject,
      ]),
    ).toEqual([
      ['María López', 2, 0, 'Factura 002'],
      ['Pedro Ruiz', 1, 1, 'Factura 003'],
    ]);
  });

  it('keeps only the conversations with a delivery problem', async () => {
    const result = await service.list(tenantA, { ...page, onlyProblems: true });

    expect(result.items.map((item) => item.contact.name)).toEqual([
      'Pedro Ruiz',
    ]);
    expect(result.total).toBe(1);
    await expect(service.summary(tenantA)).resolves.toEqual({
      problemConversations: 1,
      problemMessages: 1,
    });
  });

  it('finds a conversation by contact name, recipient or subject', async () => {
    const names = async (search: string) =>
      (
        await service.list(tenantA, { ...page, onlyProblems: false, search })
      ).items.map((item) => item.contact.name);

    await expect(names('López')).resolves.toEqual(['María López']);
    await expect(names('pedro@example')).resolves.toEqual(['Pedro Ruiz']);
    await expect(names('factura 002')).resolves.toEqual(['María López']);
    await expect(names('nadie')).resolves.toEqual([]);
  });

  it('pages the list', async () => {
    const second = await service.list(tenantA, {
      page: 2,
      limit: 1,
      onlyProblems: false,
    });

    expect(second.items.map((item) => item.contact.name)).toEqual([
      'Pedro Ruiz',
    ]);
    expect(second.total).toBe(2);
  });

  it('shows the thread newest first, notes between the messages', async () => {
    await service.createNote(tenantA, userId, 'CUSTOMER', maria, {
      body: 'Paga el viernes',
    });

    const thread = await service.thread(tenantA, 'CUSTOMER', maria, page);

    expect(thread.total).toBe(3);
    expect(
      thread.items.map((item) =>
        item.kind === 'NOTE' ? `nota: ${item.body}` : item.subject,
      ),
    ).toEqual(['nota: Paga el viernes', 'Factura 002', 'Factura 001']);
    expect(thread.items[0]).toMatchObject({
      author: { firstName: 'Juan', lastName: 'Pérez' },
    });
    const listed = await service.list(tenantA, {
      ...page,
      onlyProblems: false,
    });
    expect(listed.items[0]).toMatchObject({ notes: 1, messages: 2 });
  });

  it('never crosses tenants', async () => {
    const own = await service.list(tenantB, { ...page, onlyProblems: false });
    expect(own.items.map((item) => item.contact.name)).toEqual([
      'Otra Empresa',
    ]);

    await expect(
      service.thread(tenantA, 'CUSTOMER', foreign, page),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createNote(tenantA, userId, 'CUSTOMER', foreign, { body: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      prisma.communicationNote.count({ where: { contactId: foreign } }),
    ).resolves.toBe(0);
  });
});
