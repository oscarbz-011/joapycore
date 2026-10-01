/**
 * Integración contra PostgreSQL real: verifica que el advisory lock de
 * StockLedgerService.assertAvailable serialice dos ventas simultáneas de la última unidad.
 * Un test unitario con mocks no puede probar esto.
 *
 * Requiere DATABASE_URL apuntando a una base desechable con el esquema aplicado.
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductUnitsRepository } from '../src/modules/inventory/repositories/product-units.repository';
import { StockMovementsRepository } from '../src/modules/inventory/repositories/stock-movements.repository';
import { StockLocationsRepository } from '../src/modules/inventory/repositories/stock-locations.repository';
import { StockLedgerService } from '../src/modules/inventory/services/stock-ledger.service';

describe('StockLedgerService.assertAvailable (PostgreSQL)', () => {
  let prisma: PrismaService;
  let ledger: StockLedgerService;
  let tenantId: string;
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    ledger = new StockLedgerService(
      new StockMovementsRepository(prisma),
      new ProductUnitsRepository(prisma),
      new StockLocationsRepository(prisma),
    );
    const tenant = await prisma.tenant.create({
      data: { name: `TEST stock lock ${randomUUID()}` },
      select: { id: true },
    });
    tenantId = tenant.id;
    const warehouse = await prisma.warehouse.create({
      data: { tenantId, name: `TEST warehouse ${randomUUID()}` },
      select: { id: true },
    });
    warehouseId = warehouse.id;
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: `TEST lock ${randomUUID()}`,
        status: 'ACTIVE',
      },
    });
    productId = product.id;
    await prisma.stockMovement.create({
      data: { tenantId, productId, warehouseId, type: 'IN', quantity: 1 },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    if (productId) {
      await prisma.stockMovement.deleteMany({ where: { tenantId, productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    if (warehouseId) {
      await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    }
    if (tenantId) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  const sellOne = () =>
    prisma.$transaction(async (tx) => {
      await ledger.assertAvailable(tx, tenantId, [
        { productId, warehouseId, quantity: 1, name: 'Última unidad' },
      ]);
      // Ventana amplia entre leer y escribir: sin lock, ambas pasarían.
      await new Promise((r) => setTimeout(r, 300));
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId,
          warehouseId,
          type: 'OUT',
          quantity: -1,
        },
      });
    });

  it('lets only one of two concurrent sales take the last unit', async () => {
    const results = await Promise.allSettled([sellOne(), sellOne()]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(String(failed[0].reason)).toContain(
      'No hay stock suficiente de: Última unidad (disponible 0, pedido 1)',
    );

    const total = await prisma.stockMovement.aggregate({
      where: { tenantId, productId },
      _sum: { quantity: true },
    });
    expect(total._sum.quantity).toBe(0);
  });
});
