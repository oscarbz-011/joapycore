/**
 * Integración contra PostgreSQL real: el stock de un producto que se mide
 * (m², kg) se lleva con decimales exactos, y uno que se cuenta no acepta
 * fracciones.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductUnitsRepository } from '../src/modules/inventory/repositories/product-units.repository';
import { StockMovementsRepository } from '../src/modules/inventory/repositories/stock-movements.repository';
import { StockSourcesRepository } from '../src/modules/inventory/repositories/stock-sources.repository';
import { ProductsRepository } from '../src/modules/inventory/repositories/products.repository';
import { ProductBatchesRepository } from '../src/modules/inventory/repositories/product-batches.repository';
import { WarehousesRepository } from '../src/modules/warehouses/repositories/warehouses.repository';
import { StockLedgerService } from '../src/modules/inventory/services/stock-ledger.service';
import { StockEntryService } from '../src/modules/inventory/services/stock-entry.service';

describe('Decimal stock (PostgreSQL)', () => {
  let prisma: PrismaService;
  let ledger: StockLedgerService;
  let entries: StockEntryService;
  let movements: StockMovementsRepository;
  const tenantId = randomUUID();
  let warehouseId: string;
  let board: string;
  let chair: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    movements = new StockMovementsRepository(prisma);
    const products = new ProductsRepository(prisma);
    ledger = new StockLedgerService(
      movements,
      new ProductUnitsRepository(prisma),
      new StockSourcesRepository(prisma),
      products,
    );
    entries = new StockEntryService(
      prisma,
      products,
      new ProductUnitsRepository(prisma),
      new ProductBatchesRepository(prisma),
      movements,
      new WarehousesRepository(prisma),
    );
    await prisma.tenant.create({
      data: { id: tenantId, name: `TEST stock decimal ${tenantId}` },
    });
    warehouseId = (
      await prisma.warehouse.create({
        data: { tenantId, name: 'Central' },
        select: { id: true },
      })
    ).id;
    board = (
      await prisma.product.create({
        data: { tenantId, name: 'Melamina', status: 'ACTIVE', unitCode: 109 },
        select: { id: true },
      })
    ).id;
    chair = (
      await prisma.product.create({
        data: { tenantId, name: 'Silla', status: 'ACTIVE', unitCode: 77 },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.warehouse.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('enters, sells and counts square meters without losing a decimal', async () => {
    await entries.registerEntry(tenantId, {
      productId: board,
      quantity: 10.5,
      reason: 'PURCHASE',
      warehouseId,
    });

    await prisma.$transaction(async (tx) => {
      const sale = [{ productId: board, warehouseId, quantity: '2.375' }];
      await ledger.assertAvailable(tx, tenantId, sale);
      await ledger.consume(tx, tenantId, [
        {
          saleItemId: randomUUID(),
          productId: board,
          quantity: '2.375',
          warehouseId,
          isSerialized: false,
        },
      ]);
    });

    const stock = await movements.sumByProducts(tenantId, [board]);
    expect(stock.get(board)).toEqual(new Prisma.Decimal('8.125'));
  });

  it('refuses to take more square meters than there are, by a thousandth', async () => {
    await expect(
      prisma.$transaction((tx) =>
        ledger.assertAvailable(tx, tenantId, [
          {
            productId: board,
            warehouseId,
            quantity: '8.126',
            name: 'Melamina',
          },
        ]),
      ),
    ).rejects.toThrow('Melamina (disponible 8.125, pedido 8.126)');
  });

  it('refuses half a chair', async () => {
    await expect(
      entries.registerEntry(tenantId, {
        productId: chair,
        quantity: 1.5,
        reason: 'PURCHASE',
        warehouseId,
      }),
    ).rejects.toThrow('"Silla" se cuenta por unidad entera');
    expect(
      await prisma.stockMovement.count({
        where: { tenantId, productId: chair },
      }),
    ).toBe(0);
  });
});
