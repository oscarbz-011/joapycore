/**
 * Integración contra PostgreSQL real de los tramos comerciales de proveedores:
 * se guardan como filas con Decimal, se reemplazan junto con el proveedor o el
 * ítem, y no se mezclan empresas.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { SuppliersRepository } from '../src/modules/procurement/repositories/suppliers.repository';
import { SupplierCatalogRepository } from '../src/modules/procurement/repositories/supplier-catalog.repository';
import { SuppliersService } from '../src/modules/procurement/services/suppliers.service';

const dec = (value: string | number) => new Prisma.Decimal(value);

describe('Supplier commercial terms (PostgreSQL)', () => {
  let prisma: PrismaService;
  let suppliers: SuppliersService;
  let catalog: SupplierCatalogRepository;
  const tenantA = randomUUID();
  const tenantB = randomUUID();

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    suppliers = new SuppliersService(new SuppliersRepository(prisma));
    catalog = new SupplierCatalogRepository(prisma);
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: `TEST tramos A ${tenantA}` },
        { id: tenantB, name: `TEST tramos B ${tenantB}` },
      ],
    });
  });

  afterAll(async () => {
    const tenantIds = [tenantA, tenantB];
    await prisma.supplierCatalogItem.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.supplier.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it('stores the discounts as ordered rows with their exact decimals', async () => {
    const created = await suppliers.create(tenantA, {
      name: 'Maderera',
      isImporter: false,
      volumeDiscounts: [
        { minAmount: 5_000_000.75, percent: 5 },
        { minAmount: 1_000_000, percent: 2.25 },
      ],
      quantityDiscounts: [{ minQuantity: 10, percent: 1.5 }],
    });

    const found = await suppliers.findOne(tenantA, created.id);
    expect(found.volumeDiscounts).toEqual([
      { minAmount: dec(1_000_000), percent: dec('2.25') },
      { minAmount: dec('5000000.75'), percent: dec(5) },
    ]);
    expect(found.quantityDiscounts).toEqual([
      { minQuantity: 10, percent: dec('1.5') },
    ]);
  });

  it('replaces only the discounts an edit sends', async () => {
    const created = await suppliers.create(tenantA, {
      name: 'Ferretería',
      isImporter: false,
      volumeDiscounts: [{ minAmount: 1_000_000, percent: 2 }],
      quantityDiscounts: [{ minQuantity: 10, percent: 1 }],
    });

    const updated = await suppliers.update(tenantA, created.id, {
      leadTimeDays: 4,
      volumeDiscounts: [{ minAmount: 2_000_000, percent: 3 }],
    });

    expect(updated?.leadTimeDays).toBe(4);
    expect(updated?.volumeDiscounts).toEqual([
      { minAmount: dec(2_000_000), percent: dec(3) },
    ]);
    expect(updated?.quantityDiscounts).toEqual([
      { minQuantity: 10, percent: dec(1) },
    ]);
  });

  it('does not touch the discounts of a supplier from another company', async () => {
    const created = await suppliers.create(tenantA, {
      name: 'Aserradero',
      isImporter: false,
      volumeDiscounts: [{ minAmount: 1_000_000, percent: 2 }],
    });

    const count = await new SuppliersRepository(prisma).update(
      tenantB,
      created.id,
      {},
      { volumeDiscounts: [] },
    );

    expect(count).toBe(0);
    const found = await suppliers.findOne(tenantA, created.id);
    expect(found.volumeDiscounts).toHaveLength(1);
  });

  it('replaces the quantity prices of an item and drops them with it', async () => {
    const supplier = await suppliers.create(tenantA, {
      name: 'Distribuidora',
      isImporter: false,
    });
    const item = await catalog.upsert(tenantA, supplier.id, {
      supplierSku: 'TOR-6',
      description: 'Tornillo 6 mm',
      price: 100.5,
    });

    await catalog.update(tenantA, item.id, {}, [
      { minQuantity: 10, price: 95.25 },
      { minQuantity: 100, price: 90 },
    ]);
    expect((await catalog.findById(tenantA, item.id))?.priceTiers).toEqual([
      { minQuantity: 10, price: dec('95.25') },
      { minQuantity: 100, price: dec(90) },
    ]);

    // Otra empresa no puede cambiarlos.
    expect(await catalog.update(tenantB, item.id, {}, [])).toBe(0);

    await catalog.update(tenantA, item.id, { price: 99 }, [
      { minQuantity: 50, price: 92 },
    ]);
    const updated = await catalog.findById(tenantA, item.id);
    expect(updated?.price).toEqual(dec(99));
    expect(updated?.priceTiers).toEqual([{ minQuantity: 50, price: dec(92) }]);

    await catalog.delete(tenantA, item.id);
    expect(
      await prisma.supplierCatalogPriceTier.count({
        where: { catalogItemId: item.id },
      }),
    ).toBe(0);
  });
});
