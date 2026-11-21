/**
 * Integración contra PostgreSQL: cuando el repartidor marca que el cliente no
 * estaba en la ubicación guardada, Logística publica la corrección por el
 * outbox y Ventas la guarda en el cliente. Una corrección más vieja que la
 * ubicación guardada no la pisa.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { EventBus } from '../src/common/events/event-bus';
import { DeliveryNotesRepository } from '../src/modules/logistics/repositories/delivery-notes.repository';
import { DeliveryTrackingEventsRepository } from '../src/modules/logistics/repositories/delivery-tracking-events.repository';
import { LogisticsSourcesRepository } from '../src/modules/logistics/repositories/logistics-sources.repository';
import { DeliveryTrackingService } from '../src/modules/logistics/services/delivery-tracking.service';
import { SalesOnLocationCorrectedListener } from '../src/modules/sales/events/sales-on-location-corrected.listener';
import { CustomersRepository } from '../src/modules/sales/repositories/customers.repository';
import { PrismaService } from '../src/prisma/prisma.service';
import { createOutbox } from './support/outbox';

describe('Ubicación corregida: Logística → outbox → Ventas (PostgreSQL)', () => {
  let prisma: PrismaService;
  let tracking: DeliveryTrackingService;
  let sales: SalesOnLocationCorrectedListener;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    const { outbox, consume } = createOutbox(prisma);
    sales = new SalesOnLocationCorrectedListener(
      new CustomersRepository(prisma),
    );
    consume(
      'delivery.location.corrected',
      'sales.correct-customer-location',
      (event: Parameters<SalesOnLocationCorrectedListener['handle']>[0]) =>
        sales.handle(event),
    );
    tracking = new DeliveryTrackingService(
      new LogisticsSourcesRepository(prisma),
      new DeliveryNotesRepository(prisma),
      new DeliveryTrackingEventsRepository(prisma),
      {} as never,
      new EventBus(new EventEmitter2()),
      {} as never,
      prisma,
      outbox,
    );
  });

  afterAll(async () => {
    if (!prisma) return;
    const where = { tenantId: { in: tenantIds } };
    await prisma.outboxDelivery.deleteMany({ where });
    await prisma.outboxEvent.deleteMany({ where });
    await prisma.deliveryTrackingEvent.deleteMany({ where });
    await prisma.deliveryNote.deleteMany({ where });
    await prisma.saleOrder.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  async function seed() {
    const { id: tenantId } = await prisma.tenant.create({
      data: { name: `TEST location ${randomUUID()}` },
      select: { id: true },
    });
    tenantIds.push(tenantId);
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `courier-${randomUUID()}@company.test`,
        passwordHash: 'x',
        firstName: 'Juan',
        lastName: 'Repartidor',
      },
      select: { id: true },
    });
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        firstName: 'Ana',
        lastName: 'Prueba',
        latitude: -25.1,
        longitude: -57.1,
      },
      select: { id: true },
    });
    const order = await prisma.saleOrder.create({
      data: {
        tenantId,
        customerId: customer.id,
        orderDate: new Date(),
        status: 'INVOICED',
      },
      select: { id: true },
    });
    const note = await prisma.deliveryNote.create({
      data: { tenantId, saleOrderId: order.id, method: 'HOME_DELIVERY' },
      select: { id: true },
    });
    return {
      tenantId,
      userId: user.id,
      customerId: customer.id,
      noteId: note.id,
    };
  }

  const location = async (id: string) => {
    const c = await prisma.customer.findUniqueOrThrow({ where: { id } });
    return {
      latitude: c.latitude?.toNumber(),
      longitude: c.longitude?.toNumber(),
      locationUpdatedAt: c.locationUpdatedAt,
    };
  };

  it('moves the customer pin to where the courier found them', async () => {
    const { tenantId, userId, customerId, noteId } = await seed();

    const event = await tracking.recordTrackingEvent(
      tenantId,
      noteId,
      { locationConfirmed: false, latitude: -25.3, longitude: -57.6 },
      userId,
      ['logistics:manage'],
    );

    expect(await location(customerId)).toEqual({
      latitude: -25.3,
      longitude: -57.6,
      locationUpdatedAt: event.recordedAt,
    });
    const rows = await prisma.outboxEvent.findMany({
      where: { tenantId },
      select: { eventName: true, status: true },
    });
    expect(rows).toEqual([
      { eventName: 'delivery.location.corrected', status: 'DONE' },
    ]);
  });

  it('keeps the pin when the courier confirms it', async () => {
    const { tenantId, userId, customerId, noteId } = await seed();

    await tracking.recordTrackingEvent(
      tenantId,
      noteId,
      { locationConfirmed: true, latitude: -25.3, longitude: -57.6 },
      userId,
      ['logistics:manage'],
    );

    expect(await location(customerId)).toMatchObject({
      latitude: -25.1,
      longitude: -57.1,
    });
    expect(await prisma.outboxEvent.count({ where: { tenantId } })).toBe(0);
  });

  it('ignores a correction older than the stored location', async () => {
    const { tenantId, customerId, noteId } = await seed();
    const correction = (latitude: number, correctedAt: string) =>
      sales.handle({
        tenantId,
        deliveryNoteId: noteId,
        customerId,
        latitude,
        longitude: -57.6,
        correctedAt,
      });

    await correction(-25.5, '2026-11-18T12:00:00.000Z');
    await correction(-25.4, '2026-11-18T11:00:00.000Z');

    expect(await location(customerId)).toEqual({
      latitude: -25.5,
      longitude: -57.6,
      locationUpdatedAt: new Date('2026-11-18T12:00:00.000Z'),
    });
  });
});
