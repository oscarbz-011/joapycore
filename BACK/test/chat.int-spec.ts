import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsGateway } from '../src/notifications/gateway/notifications.gateway';
import { ChatRepository } from '../src/chat/chat.repository';
import { ChatService } from '../src/chat/chat.service';

const url = process.env.COMMUNICATIONS_TEST_DATABASE_URL;
if (url && !/^\/joapycore_comms_test_[\w-]+$/.test(new URL(url).pathname)) {
  throw new Error(
    'COMMUNICATIONS_TEST_DATABASE_URL debe apuntar a una base aislada joapycore_comms_test_*',
  );
}
const integration = url ? describe : describe.skip;

integration('Internal chat (isolated PostgreSQL)', () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const me = randomUUID();
  const ana = randomUUID();
  const luis = randomUUID();
  const inactive = randomUUID();
  const foreigner = randomUUID();
  const gateway = { emitToUser: jest.fn() };
  let prisma: PrismaService;
  let service: ChatService;

  const user = (
    id: string,
    tenantId: string,
    firstName: string,
    status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
  ) => ({
    id,
    tenantId,
    email: `${id}@example.test`,
    passwordHash: 'unused-test-only',
    firstName,
    lastName: 'Test',
    status,
  });

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    await prisma.$connect();
    service = new ChatService(
      new ChatRepository(prisma),
      gateway as unknown as NotificationsGateway,
    );
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: `Chat ${tenantA}` },
        { id: tenantB, name: `Chat ${tenantB}` },
      ],
    });
    await prisma.user.createMany({
      data: [
        user(me, tenantA, 'Yo'),
        user(ana, tenantA, 'Ana'),
        user(luis, tenantA, 'Luis'),
        user(inactive, tenantA, 'Baja', 'INACTIVE'),
        user(foreigner, tenantB, 'Ajeno'),
      ],
    });
  });

  afterAll(async () => {
    const tenants = { tenantId: { in: [tenantA, tenantB] } };
    await prisma.chatMessage.deleteMany({ where: tenants });
    await prisma.chatParticipant.deleteMany({ where: tenants });
    await prisma.chatConversation.deleteMany({ where: tenants });
    await prisma.user.deleteMany({ where: tenants });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    });
    await prisma.onModuleDestroy();
  });

  it('lists only the active coworkers of the same company', async () => {
    const people = await service.people(tenantA, me);

    expect(people.map((person) => person.firstName)).toEqual(['Ana', 'Luis']);
  });

  it('opens one direct conversation per pair, whoever starts it', async () => {
    const mine = await service.open(tenantA, me, { participantIds: [ana] });
    const hers = await service.open(tenantA, ana, { participantIds: [me] });
    const both = await Promise.all([
      service.open(tenantA, me, { participantIds: [luis] }),
      service.open(tenantA, luis, { participantIds: [me] }),
    ]);

    expect(hers.id).toBe(mine.id);
    expect(both[0].id).toBe(both[1].id);
    expect(mine.kind).toBe('DIRECT');
    expect(mine.participants.map((person) => person.firstName).sort()).toEqual([
      'Ana',
      'Yo',
    ]);
  });

  it('refuses a conversation with someone inactive or from another company', async () => {
    await expect(
      service.open(tenantA, me, { participantIds: [inactive] }),
    ).rejects.toThrow(/ya no está disponible/);
    await expect(
      service.open(tenantA, me, { participantIds: [foreigner] }),
    ).rejects.toThrow(/ya no está disponible/);
  });

  it('counts what each person has not read, and clears it when they read', async () => {
    const { id } = await service.open(tenantA, me, { participantIds: [ana] });
    await service.send(tenantA, me, id, { body: 'Hola Ana' });
    await service.send(tenantA, me, id, { body: '¿Viste la factura?' });

    const mine = (await service.conversations(tenantA, me)).find(
      (conversation) => conversation.id === id,
    );
    const hers = (await service.conversations(tenantA, ana)).find(
      (conversation) => conversation.id === id,
    );

    expect(mine).toMatchObject({ unread: 0 });
    expect(hers).toMatchObject({
      unread: 2,
      lastMessage: { body: '¿Viste la factura?', senderId: me },
    });
    await expect(service.unread(tenantA, ana)).resolves.toEqual({ unread: 2 });

    await service.markRead(tenantA, ana, id);

    await expect(service.unread(tenantA, ana)).resolves.toEqual({ unread: 0 });
    await service.send(tenantA, ana, id, { body: 'Sí, ya la vi' });
    await expect(service.unread(tenantA, me)).resolves.toEqual({ unread: 1 });
  });

  it('reads a conversation newest first and pages backwards', async () => {
    const { id } = await service.open(tenantA, me, { participantIds: [ana] });

    const first = await service.messages(tenantA, me, id, { limit: 2 });
    const older = await service.messages(tenantA, me, id, {
      limit: 2,
      before: first.items[1].createdAt.toISOString(),
    });

    expect(first.items.map((message) => message.body)).toEqual([
      'Sí, ya la vi',
      '¿Viste la factura?',
    ]);
    expect(first.hasMore).toBe(true);
    expect(older.items.map((message) => message.body)).toEqual(['Hola Ana']);
    expect(older.hasMore).toBe(false);
  });

  it('puts the conversation with the latest message first', async () => {
    const withLuis = await service.open(tenantA, me, {
      participantIds: [luis],
    });
    await service.send(tenantA, luis, withLuis.id, { body: 'Buenas' });

    const list = await service.conversations(tenantA, me);

    expect(list[0].id).toBe(withLuis.id);
    expect(list[0].unread).toBe(1);
  });

  it('keeps a group among its members only', async () => {
    const group = await service.open(tenantA, me, {
      participantIds: [ana],
      name: 'Cobranzas',
    });
    // Con una sola persona más es una conversación directa, no un grupo.
    expect(group.kind).toBe('DIRECT');

    const real = await service.open(tenantA, me, {
      participantIds: [ana, luis],
      name: 'Cobranzas',
    });
    await service.send(tenantA, ana, real.id, { body: 'Reunión a las 10' });

    expect(real).toMatchObject({ kind: 'GROUP', name: 'Cobranzas' });
    expect(real.participants).toHaveLength(3);
    await expect(service.unread(tenantA, luis)).resolves.toEqual({
      unread: 1,
    });
  });

  it('never lets someone outside read, write or see a conversation', async () => {
    const { id } = await service.open(tenantA, me, { participantIds: [ana] });

    await expect(
      service.messages(tenantA, luis, id, { limit: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.send(tenantA, luis, id, { body: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    // El mismo id pedido desde otra empresa.
    await expect(
      service.messages(tenantB, foreigner, id, { limit: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.conversations(tenantB, foreigner)).resolves.toEqual(
      [],
    );
    expect(
      (await service.conversations(tenantA, luis)).map(
        (conversation) => conversation.id,
      ),
    ).not.toContain(id);
  });
});
