/**
 * Integración contra PostgreSQL del outbox: el evento se guarda con la
 * transacción, un listener que falla deja el evento para reintento y el
 * reintento lo completa. Si la transacción revierte, el evento no existe.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { OutboxRepository } from '../src/outbox/outbox.repository';
import { OutboxService } from '../src/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('OutboxService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let events: EventEmitter2;
  let outbox: OutboxService;
  const tenantId = `outbox-test-${randomUUID()}`;
  const eventName = `test.outbox.${randomUUID()}`;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    events = new EventEmitter2();
    outbox = new OutboxService(new OutboxRepository(prisma), events);
    jest.spyOn(outbox['logger'], 'error').mockImplementation(() => undefined);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenantId } });
    await prisma.$disconnect();
  });

  it('retries a failed delivery until the listener succeeds', async () => {
    let calls = 0;
    // Listener que devuelve una promesa a propósito: emitAsync la espera y
    // así el outbox se entera del fallo.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    events.on(eventName, (payload: { value: number }) => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('listener caído'));
      expect(payload.value).toBe(42);
      return Promise.resolve();
    });

    const id = await prisma.$transaction((tx) =>
      outbox.enqueue(tx, tenantId, eventName, { value: 42 }),
    );

    await expect(outbox.dispatch(id)).resolves.toBe(false);
    let row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      lastError: 'listener caído',
    });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Todavía no toca reintentar: dispatch no lo toma.
    await expect(outbox.dispatch(id)).resolves.toBe(false);
    expect(calls).toBe(1);

    await prisma.outboxEvent.update({
      where: { id },
      data: { nextAttemptAt: new Date() },
    });
    await outbox.processDue();

    row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'DONE', attempts: 2 });
    expect(calls).toBe(2);
  });

  it('does not keep the event when the business transaction rolls back', async () => {
    let enqueued: string | undefined;
    await expect(
      prisma.$transaction(async (tx) => {
        enqueued = await outbox.enqueue(tx, tenantId, eventName, { value: 1 });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(enqueued).toBeDefined();
    await expect(
      prisma.outboxEvent.findUnique({ where: { id: enqueued } }),
    ).resolves.toBeNull();
  });
});
