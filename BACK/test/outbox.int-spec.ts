/**
 * Integración contra PostgreSQL del outbox: el evento se guarda con la
 * transacción, cada consumidor registra su entrega y un reintento solo vuelve
 * a llamar a los que fallaron. Si la transacción revierte, el evento no existe.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { DomainEventName } from '../src/common/events/domain-events';
import { OutboxService } from '../src/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createOutbox } from './support/outbox';

describe('OutboxService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let outbox: OutboxService;
  let consume: ReturnType<typeof createOutbox>['consume'];
  const tenantId = `outbox-test-${randomUUID()}`;
  // Nombres fuera del catálogo: el test prueba la mecánica del outbox.
  const event = () => `test.outbox.${randomUUID()}` as DomainEventName;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    ({ outbox, consume } = createOutbox(prisma));
    jest.spyOn(outbox['logger'], 'error').mockImplementation(() => undefined);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenantId } });
    await prisma.$disconnect();
  });

  const enqueue = (eventName: DomainEventName, payload: object) =>
    prisma.$transaction((tx) =>
      outbox.enqueue(tx, tenantId, eventName, {
        tenantId,
        ...payload,
      }),
    );

  const retryNow = async (id: string) => {
    await prisma.outboxEvent.update({
      where: { id },
      data: { nextAttemptAt: new Date() },
    });
    await outbox.processDue();
  };

  it('retries a failed consumer until it succeeds', async () => {
    const eventName = event();
    let calls = 0;
    consume(eventName, `retry-${eventName}`, (payload: { value: number }) => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('consumidor caído'));
      expect(payload.value).toBe(42);
      return Promise.resolve();
    });
    const id = await enqueue(eventName, { value: 42 });

    await expect(outbox.dispatch(id)).resolves.toBe(false);
    let row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(row.lastError).toContain('consumidor caído');
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Todavía no toca reintentar: dispatch no lo toma.
    await expect(outbox.dispatch(id)).resolves.toBe(false);
    expect(calls).toBe(1);

    await retryNow(id);

    row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'DONE', attempts: 2 });
    expect(calls).toBe(2);
  });

  it('calls again only the consumer that failed', async () => {
    const eventName = event();
    let healthyCalls = 0;
    let flakyCalls = 0;
    consume(eventName, `healthy-${eventName}`, () => {
      healthyCalls++;
    });
    consume(eventName, `flaky-${eventName}`, () => {
      flakyCalls++;
      if (flakyCalls === 1) throw new Error('una vez');
    });
    const id = await enqueue(eventName, {});

    await expect(outbox.dispatch(id)).resolves.toBe(false);
    await retryNow(id);

    expect(healthyCalls).toBe(1);
    expect(flakyCalls).toBe(2);
    const deliveries = await prisma.outboxDelivery.findMany({
      where: { eventId: id },
      orderBy: { consumer: 'asc' },
      select: { consumer: true, status: true, attempts: true },
    });
    expect(deliveries).toEqual([
      { consumer: `flaky-${eventName}`, status: 'DONE', attempts: 2 },
      { consumer: `healthy-${eventName}`, status: 'DONE', attempts: 1 },
    ]);
  });

  it('does not keep the event when the business transaction rolls back', async () => {
    let enqueued: string | undefined;
    await expect(
      prisma.$transaction(async (tx) => {
        enqueued = await outbox.enqueue(tx, tenantId, event(), {
          value: 1,
        } as never);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(enqueued).toBeDefined();
    await expect(
      prisma.outboxEvent.findUnique({ where: { id: enqueued } }),
    ).resolves.toBeNull();
  });
});
