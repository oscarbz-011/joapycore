/**
 * Integración contra PostgreSQL real: la regularización de stock sin depósito
 * conserva el total, respeta el tenant y no se duplica bajo concurrencia.
 *
 * Requiere DATABASE_URL apuntando a una base desechable con el esquema aplicado.
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductUnitsRepository } from '../src/modules/inventory/repositories/product-units.repository';
import { ProductsRepository } from '../src/modules/inventory/repositories/products.repository';
import { StockMovementsRepository } from '../src/modules/inventory/repositories/stock-movements.repository';
import { UnlocatedStockService } from '../src/modules/inventory/services/unlocated-stock.service';
import { WarehousesRepository } from '../src/modules/warehouses/repositories/warehouses.repository';

describe('UnlocatedStockService.assign (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: UnlocatedStockService;
  let tenantId: string;
  let otherTenantId: string;
  let warehouseId: string;
  let otherWarehouseId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    service = new UnlocatedStockService(
      prisma,
      new ProductsRepository(prisma),
      new ProductUnitsRepository(prisma),
      new StockMovementsRepository(prisma),
      new WarehousesRepository(prisma),
      { emit: jest.fn() } as any,
    );
    const createTenant = async () => {
      const tenant = await prisma.tenant.create({
        data: { name: `TEST unlocated ${randomUUID()}` },
        select: { id: true },
      });
      const warehouse = await prisma.warehouse.create({
        data: { tenantId: tenant.id, name: `TEST warehouse ${randomUUID()}` },
        select: { id: true },
      });
      return { tenantId: tenant.id, warehouseId: warehouse.id };
    };
    ({ tenantId, warehouseId } = await createTenant());
    ({ tenantId: otherTenantId, warehouseId: otherWarehouseId } =
      await createTenant());
  });

  afterAll(async () => {
    if (!prisma) return;
    const tenants = [tenantId, otherTenantId].filter(Boolean);
    const where = { tenantId: { in: tenants } };
    await prisma.stockMovement.deleteMany({ where });
    await prisma.productUnit.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.warehouse.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.$disconnect();
  });

  const createProduct = async (isSerialized = false) => {
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: `TEST unlocated ${randomUUID()}`,
        status: 'ACTIVE',
        isSerialized,
      },
      select: { id: true },
    });
    return product.id;
  };

  const balances = async (productId: string) => {
    const groups = await prisma.stockMovement.groupBy({
      by: ['warehouseId'],
      where: { tenantId, productId },
      _sum: { quantity: true },
    });
    const of = (id: string | null) =>
      groups.find((group) => group.warehouseId === id)?._sum.quantity ?? 0;
    return { unlocated: of(null), warehouse: of(warehouseId) };
  };

  it('moves a positive unlocated balance into the warehouse', async () => {
    const productId = await createProduct();
    await prisma.stockMovement.create({
      data: { tenantId, productId, type: 'IN', quantity: 5 },
    });

    await service.assign(tenantId, { productId, warehouseId, quantity: 3 });

    await expect(balances(productId)).resolves.toEqual({
      unlocated: 2,
      warehouse: 3,
    });
  });

  it('charges a negative unlocated balance to the warehouse', async () => {
    const productId = await createProduct();
    await prisma.stockMovement.createMany({
      data: [
        { tenantId, productId, warehouseId, type: 'IN', quantity: 10 },
        { tenantId, productId, type: 'OUT', quantity: -2 },
      ],
    });

    await service.assign(tenantId, { productId, warehouseId });

    await expect(balances(productId)).resolves.toEqual({
      unlocated: 0,
      warehouse: 8,
    });
  });

  it('rejects a negative balance the warehouse cannot absorb and writes nothing', async () => {
    const productId = await createProduct();
    await prisma.stockMovement.create({
      data: { tenantId, productId, type: 'OUT', quantity: -2 },
    });

    await expect(
      service.assign(tenantId, { productId, warehouseId }),
    ).rejects.toThrow('No hay stock suficiente');
    await expect(balances(productId)).resolves.toEqual({
      unlocated: -2,
      warehouse: 0,
    });
  });

  it('locates serialized units and leaves located or sold ones untouched', async () => {
    const productId = await createProduct(true);
    await prisma.productUnit.createMany({
      data: [
        { tenantId, productId, serialNumber: 'SN-1' },
        { tenantId, productId, serialNumber: 'SN-2' },
        { tenantId, productId, serialNumber: 'SN-SOLD', status: 'SOLD' },
      ],
    });

    await service.assign(tenantId, { productId, warehouseId });

    const units = await prisma.productUnit.findMany({
      where: { tenantId, productId },
      select: { serialNumber: true, warehouseId: true },
      orderBy: { serialNumber: 'asc' },
    });
    expect(units).toEqual([
      { serialNumber: 'SN-1', warehouseId },
      { serialNumber: 'SN-2', warehouseId },
      { serialNumber: 'SN-SOLD', warehouseId: null },
    ]);
  });

  it('denies another tenant and a warehouse of another tenant', async () => {
    const productId = await createProduct();
    await prisma.stockMovement.create({
      data: { tenantId, productId, type: 'IN', quantity: 1 },
    });

    await expect(
      service.assign(otherTenantId, {
        productId,
        warehouseId: otherWarehouseId,
      }),
    ).rejects.toThrow('Product not found');
    await expect(
      service.assign(tenantId, { productId, warehouseId: otherWarehouseId }),
    ).rejects.toThrow('El depósito no existe o está inactivo');
    await expect(balances(productId)).resolves.toEqual({
      unlocated: 1,
      warehouse: 0,
    });
  });

  it('assigns the balance only once under concurrent requests', async () => {
    const productId = await createProduct();
    await prisma.stockMovement.create({
      data: { tenantId, productId, type: 'IN', quantity: 4 },
    });

    const results = await Promise.allSettled([
      service.assign(tenantId, { productId, warehouseId }),
      service.assign(tenantId, { productId, warehouseId }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    await expect(balances(productId)).resolves.toEqual({
      unlocated: 0,
      warehouse: 4,
    });
  });
});
