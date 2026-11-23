/**
 * Integración contra PostgreSQL de "Procesos con errores": qué ve cada
 * empresa, que la limpieza diaria no borre lo que falló sin reintento y que
 * el reintento de un administrador resuelva solo lo que falló.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DomainEventName } from '../src/common/events/domain-events';
import { FailedProcessesService } from '../src/outbox/failed-processes.service';
import { OutboxRepository } from '../src/outbox/outbox.repository';
import {
  OUTBOX_MAX_ATTEMPTS,
  OutboxService,
} from '../src/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/prisma/tenant-context';
import { createOutbox } from './support/outbox';

describe('FailedProcessesService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let outbox: OutboxService;
  let repository: OutboxRepository;
  let failedProcesses: FailedProcessesService;
  let consume: ReturnType<typeof createOutbox>['consume'];
  const tenantA = `failed-a-${randomUUID()}`;
  const tenantB = `failed-b-${randomUUID()}`;
  // Nombres fuera del catálogo: el test prueba la mecánica, no un evento real.
  const eventName = `test.failed.${randomUUID()}` as DomainEventName;
  const cleanEvent = `test.clean.${randomUUID()}` as DomainEventName;
  const broken = { receivable: true, email: true };

  const asTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
    TenantContext.run(tenantId, fn);
  const asPlatform = <T>(fn: () => Promise<T>) =>
    TenantContext.runAsPlatform(fn);

  const enqueue = (tenantId: string, name: DomainEventName) =>
    asTenant(tenantId, () =>
      prisma.$transaction((tx) =>
        outbox.enqueue(tx, tenantId, name, {
          tenantId,
          invoiceId: `inv-${tenantId}`,
        }),
      ),
    );

  // Los 10 reintentos tardan horas: se dejan agotados a mano.
  const exhaust = (id: string) =>
    asPlatform(() =>
      prisma.outboxEvent.update({
        where: { id },
        data: { attempts: OUTBOX_MAX_ATTEMPTS },
      }),
    );

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    ({ outbox, consume } = createOutbox(prisma));
    repository = new OutboxRepository(prisma);
    failedProcesses = new FailedProcessesService(repository, outbox);
    jest.spyOn(outbox['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(outbox['logger'], 'warn').mockImplementation(() => undefined);

    consume(eventName, `receivable-${eventName}`, () => {
      if (broken.receivable) throw new Error('base caída');
    });
    consume(
      eventName,
      `email-${eventName}`,
      () => {
        if (broken.email) throw new Error('el cliente no tiene correo');
      },
      { retry: false },
    );
    consume(cleanEvent, `clean-${cleanEvent}`, () => undefined);
  });

  afterAll(async () => {
    await asPlatform(() =>
      prisma.outboxEvent.deleteMany({
        where: { tenantId: { in: [tenantA, tenantB] } },
      }),
    );
    await prisma.$disconnect();
  });

  it('lists only the failures of the company, then resolves them on retry', async () => {
    const stuckId = await enqueue(tenantA, eventName);
    await asTenant(tenantA, () => outbox.dispatch(stuckId));
    await exhaust(stuckId);
    const otherId = await enqueue(tenantB, eventName);
    await asTenant(tenantB, () => outbox.dispatch(otherId));
    await exhaust(otherId);

    const rows = await asTenant(tenantA, () => failedProcesses.list(tenantA));
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: stuckId,
          consumer: `receivable-${eventName}`,
          kind: 'STUCK',
          error: 'base caída',
          document: { type: 'invoice', id: `inv-${tenantA}` },
        }),
        expect.objectContaining({
          eventId: stuckId,
          consumer: `email-${eventName}`,
          kind: 'NOT_RETRIED',
          error: 'el cliente no tiene correo',
        }),
      ]),
    );
    await expect(
      asTenant(tenantA, () => failedProcesses.count(tenantA)),
    ).resolves.toEqual({ count: 2 });

    // Otra empresa no puede reintentar ni enterarse del proceso.
    await expect(
      asTenant(tenantB, () =>
        failedProcesses.retry(tenantB, stuckId, `receivable-${eventName}`),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    broken.receivable = false;
    await expect(
      asTenant(tenantA, () =>
        failedProcesses.retry(tenantA, stuckId, `receivable-${eventName}`),
      ),
    ).resolves.toEqual({ resolved: true });
    let rowsAfter = await asTenant(tenantA, () =>
      failedProcesses.list(tenantA),
    );
    expect(rowsAfter).toEqual([
      expect.objectContaining({ consumer: `email-${eventName}` }),
    ]);

    broken.email = false;
    await expect(
      asTenant(tenantA, () =>
        failedProcesses.retry(tenantA, stuckId, `email-${eventName}`),
      ),
    ).resolves.toEqual({ resolved: true });
    rowsAfter = await asTenant(tenantA, () => failedProcesses.list(tenantA));
    expect(rowsAfter).toEqual([]);

    const otherRows = await asTenant(tenantB, () =>
      failedProcesses.list(tenantB),
    );
    expect(otherRows).toHaveLength(2);
  });

  it('keeps a failure without retry through the daily cleanup', async () => {
    broken.email = true;
    broken.receivable = false;
    const failedId = await enqueue(tenantA, eventName);
    await asTenant(tenantA, () => outbox.dispatch(failedId));
    const cleanId = await enqueue(tenantA, cleanEvent);
    await asTenant(tenantA, () => outbox.dispatch(cleanId));
    const old = new Date(Date.now() - 30 * 86_400_000);
    await asPlatform(() =>
      prisma.outboxEvent.updateMany({
        where: { id: { in: [failedId, cleanId] } },
        data: { processedAt: old },
      }),
    );

    await asPlatform(() => repository.deleteDoneBefore(new Date()));

    const left = await asPlatform(() =>
      prisma.outboxEvent.findMany({
        where: { id: { in: [failedId, cleanId] } },
        select: { id: true },
      }),
    );
    expect(left.map((e) => e.id)).toEqual([failedId]);
  });
});
