/**
 * Integración contra PostgreSQL de la cadena entrega → descuento de stock:
 * Logística cierra la nota y el evento viaja por el outbox hasta Ventas, que
 * descuenta el stock una sola vez aunque el evento se repita o falle y se
 * reintente. Sin Logística, Ventas registra la entrega por su cuenta.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { ProductUnitsRepository } from '../src/modules/inventory/repositories/product-units.repository';
import { StockLocationsRepository } from '../src/modules/inventory/repositories/stock-locations.repository';
import { StockMovementsRepository } from '../src/modules/inventory/repositories/stock-movements.repository';
import { StockLedgerService } from '../src/modules/inventory/services/stock-ledger.service';
import { DeliveryNotesRepository } from '../src/modules/logistics/repositories/delivery-notes.repository';
import { LogisticsSourcesRepository } from '../src/modules/logistics/repositories/logistics-sources.repository';
import { DeliveryNotesService } from '../src/modules/logistics/services/delivery-notes.service';
import { SalesOnDeliveryListener } from '../src/modules/sales/events/sales-on-delivery.listener';
import { CreditSourcesRepository } from '../src/modules/sales/repositories/credit-sources.repository';
import { CustomersRepository } from '../src/modules/sales/repositories/customers.repository';
import { SaleOrdersRepository } from '../src/modules/sales/repositories/sale-orders.repository';
import { SalesSourcesRepository } from '../src/modules/sales/repositories/sales-sources.repository';
import { SaleOrdersService } from '../src/modules/sales/services/sale-orders.service';
import { OutboxRepository } from '../src/outbox/outbox.repository';
import { OutboxService } from '../src/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantModulesRepository } from '../src/tenants/repositories/tenant-modules.repository';
import { TenantModulesCache } from '../src/tenants/services/tenant-modules.cache';

describe('Entrega → descuento de stock (PostgreSQL)', () => {
  let prisma: PrismaService;
  let events: EventEmitter2;
  let outbox: OutboxService;
  let sales: SaleOrdersService;
  let notes: DeliveryNotesService;
  let tenantModules: TenantModulesCache;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    events = new EventEmitter2();
    outbox = new OutboxService(new OutboxRepository(prisma), events);
    jest.spyOn(outbox['logger'], 'error').mockImplementation(() => undefined);
    tenantModules = new TenantModulesCache(new TenantModulesRepository(prisma));
    sales = new SaleOrdersService(
      prisma,
      new SaleOrdersRepository(prisma),
      { findManyByIds: jest.fn() },
      {} as never,
      {} as never,
      events,
      new StockLedgerService(
        new StockMovementsRepository(prisma),
        new ProductUnitsRepository(prisma),
        new StockLocationsRepository(prisma),
      ),
      outbox,
      new CreditSourcesRepository(prisma),
      new SalesSourcesRepository(prisma),
      new CustomersRepository(prisma),
      tenantModules,
    );
    notes = new DeliveryNotesService(
      new DeliveryNotesRepository(prisma),
      events,
      new LogisticsSourcesRepository(prisma),
      prisma,
      outbox,
    );
    const listener = new SalesOnDeliveryListener(sales);
    // Mismo contrato que @OnEvent con suppressErrors: false: emitAsync espera
    // la promesa y el outbox se entera si falla.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    events.on('delivery.note.delivered', (event) => listener.handle(event));
  });

  afterAll(async () => {
    if (!prisma) return;
    const where = { tenantId: { in: tenantIds } };
    await prisma.outboxEvent.deleteMany({ where });
    await prisma.stockMovement.deleteMany({ where });
    await prisma.deliveryNote.deleteMany({ where });
    await prisma.saleOrderItem.deleteMany({
      where: { saleOrder: { tenantId: { in: tenantIds } } },
    });
    await prisma.saleOrder.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.warehouse.deleteMany({ where });
    await prisma.tenantModule.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  async function seed(options: {
    logistics: boolean;
    status: 'CONFIRMED' | 'INVOICED';
  }) {
    const tenant = await prisma.tenant.create({
      data: { name: `TEST delivery ${randomUUID()}` },
      select: { id: true },
    });
    const tenantId = tenant.id;
    tenantIds.push(tenantId);
    await prisma.tenantModule.create({
      data: { tenantId, moduleName: 'logistics', active: options.logistics },
    });
    const warehouse = await prisma.warehouse.create({
      data: { tenantId, name: `TEST warehouse ${randomUUID()}` },
      select: { id: true },
    });
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: `TEST product ${randomUUID()}`,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    await prisma.stockMovement.create({
      data: {
        tenantId,
        productId: product.id,
        warehouseId: warehouse.id,
        type: 'IN',
        quantity: 10,
      },
    });
    const customer = await prisma.customer.create({
      data: { tenantId, firstName: 'Ana', lastName: 'Prueba' },
      select: { id: true },
    });
    const order = await prisma.saleOrder.create({
      data: {
        tenantId,
        customerId: customer.id,
        orderDate: new Date(),
        status: options.status,
        items: {
          create: {
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: 3,
            unitPrice: 1000,
          },
        },
      },
      select: { id: true },
    });
    return { tenantId, productId: product.id, orderId: order.id };
  }

  const stockOf = async (tenantId: string, productId: string) => {
    const sum = await prisma.stockMovement.aggregate({
      where: { tenantId, productId },
      _sum: { quantity: true },
    });
    return sum._sum.quantity;
  };

  const orderStatus = async (id: string) =>
    (await prisma.saleOrder.findUniqueOrThrow({ where: { id } })).status;

  it('closing the note delivers the order and takes the stock once', async () => {
    const { tenantId, productId, orderId } = await seed({
      logistics: true,
      status: 'INVOICED',
    });
    const note = await prisma.deliveryNote.create({
      data: { tenantId, saleOrderId: orderId, method: 'PICKUP' },
      select: { id: true },
    });

    await notes.complete(tenantId, note.id, undefined);

    expect(await orderStatus(orderId)).toBe('DELIVERED');
    expect(await stockOf(tenantId, productId)).toBe(7);
    const outboxRows = await prisma.outboxEvent.findMany({
      where: { tenantId },
      select: { eventName: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(outboxRows).toEqual([
      { eventName: 'delivery.note.delivered', status: 'DONE' },
      { eventName: 'sale.order.stock_out', status: 'DONE' },
    ]);

    // El mismo evento otra vez (reintento del outbox) no descuenta de nuevo.
    await events.emitAsync('delivery.note.delivered', {
      tenantId,
      saleOrderId: orderId,
      deliveryNoteId: note.id,
    });
    expect(await stockOf(tenantId, productId)).toBe(7);
  });

  it('keeps the delivery and retries the stock-out when Sales fails once', async () => {
    const { tenantId, productId, orderId } = await seed({
      logistics: true,
      status: 'CONFIRMED',
    });
    const note = await prisma.deliveryNote.create({
      data: { tenantId, saleOrderId: orderId, method: 'PICKUP' },
      select: { id: true },
    });
    const spy = jest
      .spyOn(sales, 'handleDeliveryConfirmed')
      .mockRejectedValueOnce(new Error('ventas caída'));

    await notes.complete(tenantId, note.id, undefined);

    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { tenantId, eventName: 'delivery.note.delivered' },
    });
    expect(event).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(await orderStatus(orderId)).toBe('CONFIRMED');
    expect(await stockOf(tenantId, productId)).toBe(10);

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { nextAttemptAt: new Date() },
    });
    await outbox.processDue();

    expect(await orderStatus(orderId)).toBe('DELIVERED');
    expect(await stockOf(tenantId, productId)).toBe(7);
    spy.mockRestore();
  });

  it('lets Sales deliver an invoiced order when the tenant has no Logistics', async () => {
    const { tenantId, productId, orderId } = await seed({
      logistics: false,
      status: 'INVOICED',
    });

    await sales.deliver(tenantId, orderId);

    expect(await orderStatus(orderId)).toBe('DELIVERED');
    expect(await stockOf(tenantId, productId)).toBe(7);
    await expect(sales.deliver(tenantId, orderId)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(await stockOf(tenantId, productId)).toBe(7);
  });

  it('keeps Sales out of the delivery while Logistics is active', async () => {
    const { tenantId, productId, orderId } = await seed({
      logistics: true,
      status: 'INVOICED',
    });

    await expect(sales.deliver(tenantId, orderId)).rejects.toThrow(
      /desde Logística/,
    );
    expect(await orderStatus(orderId)).toBe('INVOICED');
    expect(await stockOf(tenantId, productId)).toBe(10);
  });

  it('does not deliver another tenant’s order', async () => {
    const own = await seed({ logistics: false, status: 'INVOICED' });
    const other = await seed({ logistics: false, status: 'INVOICED' });

    await expect(sales.deliver(own.tenantId, other.orderId)).rejects.toThrow();
    expect(await orderStatus(other.orderId)).toBe('INVOICED');
    expect(await stockOf(other.tenantId, other.productId)).toBe(10);
  });

  it('on activation, closes what Sales delivered and opens what is pending', async () => {
    const delivered = await seed({ logistics: false, status: 'INVOICED' });
    const { tenantId } = delivered;
    const staleNote = await prisma.deliveryNote.create({
      data: { tenantId, saleOrderId: delivered.orderId },
      select: { id: true },
    });
    await sales.deliver(tenantId, delivered.orderId);
    const customer = await prisma.customer.findFirstOrThrow({
      where: { tenantId },
    });
    const pending = await prisma.saleOrder.create({
      data: {
        tenantId,
        customerId: customer.id,
        orderDate: new Date(),
        status: 'CONFIRMED',
      },
      select: { id: true },
    });
    await prisma.tenantModule.updateMany({
      where: { tenantId, moduleName: 'logistics' },
      data: { active: true },
    });

    await expect(notes.syncWithSales(tenantId)).resolves.toEqual({
      closed: 1,
      created: 1,
    });

    const stale = await prisma.deliveryNote.findUniqueOrThrow({
      where: { id: staleNote.id },
    });
    expect(stale.status).toBe('DELIVERED');
    const created = await prisma.deliveryNote.findUniqueOrThrow({
      where: { saleOrderId: pending.id },
    });
    expect(created.status).toBe('PENDING');
  });

  it('does not close another tenant’s note', async () => {
    const own = await seed({ logistics: true, status: 'INVOICED' });
    const other = await seed({ logistics: true, status: 'INVOICED' });
    const note = await prisma.deliveryNote.create({
      data: { tenantId: other.tenantId, saleOrderId: other.orderId },
      select: { id: true },
    });

    await expect(
      new DeliveryNotesRepository(prisma).close(own.tenantId, note.id),
    ).resolves.toBe(0);
    const untouched = await prisma.deliveryNote.findUniqueOrThrow({
      where: { id: note.id },
    });
    expect(untouched.status).toBe('PENDING');
  });

  it('syncs at startup only the tenants that use Logistics', async () => {
    const off = await seed({ logistics: false, status: 'INVOICED' });
    const offNote = await prisma.deliveryNote.create({
      data: { tenantId: off.tenantId, saleOrderId: off.orderId },
      select: { id: true },
    });
    await sales.deliver(off.tenantId, off.orderId);
    const on = await seed({ logistics: true, status: 'INVOICED' });

    await notes.syncWithSales();

    const stillOpen = await prisma.deliveryNote.findUniqueOrThrow({
      where: { id: offNote.id },
    });
    expect(stillOpen.status).toBe('PENDING');
    const created = await prisma.deliveryNote.findUniqueOrThrow({
      where: { saleOrderId: on.orderId },
    });
    expect(created.status).toBe('PENDING');
  });
});
