/**
 * Integración contra PostgreSQL real: las presentaciones guardan su factor
 * exacto, no repiten nombre en un producto y no se ven desde otra empresa.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductPresentationsRepository } from '../src/modules/inventory/repositories/product-presentations.repository';
import { ProductsRepository } from '../src/modules/inventory/repositories/products.repository';
import { ProductPresentationsService } from '../src/modules/inventory/services/product-presentations.service';

describe('Product presentations (PostgreSQL)', () => {
  let prisma: PrismaService;
  let products: ProductsRepository;
  let service: ProductPresentationsService;
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  let board: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    products = new ProductsRepository(prisma);
    service = new ProductPresentationsService(
      products,
      new ProductPresentationsRepository(prisma),
    );
    await prisma.tenant.createMany({
      data: [
        { id: tenantId, name: `TEST presentaciones ${tenantId}` },
        { id: otherTenantId, name: `TEST presentaciones ${otherTenantId}` },
      ],
    });
    board = (
      await prisma.product.create({
        data: { tenantId, name: 'MDF 18 mm', status: 'ACTIVE', unitCode: 109 },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.productPresentation.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({
      where: { tenantId: { in: [tenantId, otherTenantId] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantId, otherTenantId] } },
    });
    await prisma.$disconnect();
  });

  it('stores the exact area of a board computed from its dimensions', async () => {
    const sheet = await service.create(tenantId, board, {
      name: 'Plancha entera',
      length: 2.75,
      width: 1.83,
      salePrice: 480000,
    });

    const stored = await prisma.productPresentation.findUniqueOrThrow({
      where: { id: sheet.id },
    });
    expect(stored.factor).toEqual(new Prisma.Decimal('5.0325'));
    expect(stored.length).toEqual(new Prisma.Decimal('2.75'));
    expect(stored.unitCode).toBe(77);
  });

  it('refuses a second presentation with the same name', async () => {
    await expect(
      service.create(tenantId, board, {
        name: 'Plancha entera',
        length: 2.6,
        width: 1.83,
        salePrice: 450000,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('lists the units the company uses, in products and presentations, without other companies', async () => {
    await prisma.product.create({
      data: { tenantId: otherTenantId, name: 'Arena', unitCode: 110 },
    });

    await expect(products.findUnitCodesInUse(tenantId)).resolves.toEqual([
      77, 109,
    ]);
    await expect(products.findUnitCodesInUse(otherTenantId)).resolves.toEqual([
      110,
    ]);
  });

  it('does not show the presentations to another company', async () => {
    const [sheet] = await service.list(tenantId, board);

    await expect(service.list(otherTenantId, board)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      products.findPresentationsByIds(otherTenantId, [sheet.id]),
    ).resolves.toEqual([]);
    await expect(
      products.findPresentationsByIds(tenantId, [sheet.id]),
    ).resolves.toHaveLength(1);
  });
});
