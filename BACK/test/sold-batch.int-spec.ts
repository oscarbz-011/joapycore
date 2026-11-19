/**
 * Integración contra PostgreSQL: al entregarse una venta, Inventario consume
 * los lotes por FIFO y avisa por el outbox qué lote usó cada renglón; Ventas
 * lo anota en su renglón. Repetir la entrega no consume ni anota de nuevo.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { InventoryOnSaleDeliveredListener } from '../src/modules/inventory/events/inventory-on-sale-delivered.listener';
import { ProductBatchesRepository } from '../src/modules/inventory/repositories/product-batches.repository';
import { ProductUnitsRepository } from '../src/modules/inventory/repositories/product-units.repository';
import { ProductsRepository } from '../src/modules/inventory/repositories/products.repository';
import { StockMovementsRepository } from '../src/modules/inventory/repositories/stock-movements.repository';
import { StockSourcesRepository } from '../src/modules/inventory/repositories/stock-sources.repository';
import { StockEntryService } from '../src/modules/inventory/services/stock-entry.service';
import { SalesOnBatchConsumedListener } from '../src/modules/sales/events/sales-on-batch-consumed.listener';
import { SaleOrdersRepository } from '../src/modules/sales/repositories/sale-orders.repository';
import { WarehousesRepository } from '../src/modules/warehouses/repositories/warehouses.repository';
import { PrismaService } from '../src/prisma/prisma.service';
import { createOutbox } from './support/outbox';

describe('Lote vendido: Inventario → outbox → Ventas (PostgreSQL)', () => {
  let prisma: PrismaService;
  let listener: InventoryOnSaleDeliveredListener;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    const { outbox, consume } = createOutbox(prisma);
    const sales = new SalesOnBatchConsumedListener(
      new SaleOrdersRepository(prisma),
    );
    consume(
      'inventory.batch.consumed',
      'sales.record-sold-batch',
      (event: Parameters<SalesOnBatchConsumedListener['handle']>[0]) =>
        sales.handle(event),
    );
    const movements = new StockMovementsRepository(prisma);
    listener = new InventoryOnSaleDeliveredListener(
      prisma,
      new StockEntryService(
        prisma,
        new ProductsRepository(prisma),
        new ProductUnitsRepository(prisma),
        new ProductBatchesRepository(prisma),
        movements,
        new WarehousesRepository(prisma),
      ),
      new StockSourcesRepository(prisma),
      movements,
      outbox,
    );
  });

  afterAll(async () => {
    if (!prisma) return;
    const where = { tenantId: { in: tenantIds } };
    await prisma.outboxDelivery.deleteMany({ where });
    await prisma.outboxEvent.deleteMany({ where });
    await prisma.stockMovement.deleteMany({ where });
    await prisma.saleOrderItem.deleteMany({ where });
    await prisma.saleOrder.deleteMany({ where });
    await prisma.productBatch.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.warehouse.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  async function seed() {
    const { id: tenantId } = await prisma.tenant.create({
      data: { name: `TEST sold batch ${randomUUID()}` },
      select: { id: true },
    });
    tenantIds.push(tenantId);
    const warehouse = await prisma.warehouse.create({
      data: { tenantId, name: 'TEST warehouse' },
      select: { id: true },
    });
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: `TEST product ${randomUUID()}`,
        status: 'ACTIVE',
        usesLots: true,
      },
      select: { id: true },
    });
    const batch = (number: string, entryDate: string) =>
      prisma.productBatch.create({
        data: {
          tenantId,
          productId: product.id,
          batchNumber: number,
          entryDate: new Date(entryDate),
          unitCost: 100,
          quantity: 5,
          remainingQty: 5,
        },
        select: { id: true },
      });
    const oldest = await batch('L-1', '2026-01-01T00:00:00Z');
    await batch('L-2', '2026-02-01T00:00:00Z');
    const customer = await prisma.customer.create({
      data: { tenantId, firstName: 'Ana', lastName: 'Prueba' },
      select: { id: true },
    });
    const order = await prisma.saleOrder.create({
      data: {
        tenantId,
        customerId: customer.id,
        orderDate: new Date(),
        status: 'DELIVERED',
        items: {
          create: {
            tenantId,
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: 3,
            unitPrice: 1000,
          },
        },
      },
      select: { id: true, items: { select: { id: true } } },
    });
    return {
      tenantId,
      saleOrderId: order.id,
      saleItemId: order.items[0].id,
      oldestBatchId: oldest.id,
    };
  }

  it('records on the sale line the batch the goods came from', async () => {
    const { tenantId, saleOrderId, saleItemId, oldestBatchId } = await seed();

    await listener.handle({ tenantId, saleOrderId });

    const item = await prisma.saleOrderItem.findUniqueOrThrow({
      where: { id: saleItemId },
    });
    expect(item.batchId).toBe(oldestBatchId);
    const rows = await prisma.outboxEvent.findMany({
      where: { tenantId },
      select: { eventName: true, status: true },
    });
    expect(rows).toEqual([
      { eventName: 'inventory.batch.consumed', status: 'DONE' },
    ]);
  });

  it('does not consume or publish again when the delivery is replayed', async () => {
    const { tenantId, saleOrderId, oldestBatchId } = await seed();

    await listener.handle({ tenantId, saleOrderId });
    await listener.handle({ tenantId, saleOrderId });

    const batch = await prisma.productBatch.findUniqueOrThrow({
      where: { id: oldestBatchId },
    });
    expect(batch.remainingQty).toBe(2);
    expect(await prisma.outboxEvent.count({ where: { tenantId } })).toBe(1);
  });
});
