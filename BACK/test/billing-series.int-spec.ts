/**
 * Integración contra PostgreSQL real: la numeración de las series no repite
 * números bajo concurrencia, respeta el rango y el tenant.
 *
 * Requiere DATABASE_URL apuntando a una base desechable con el esquema aplicado.
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { BillingSeriesRepository } from '../src/modules/billing/repositories/billing-series.repository';
import { BillingSourcesRepository } from '../src/modules/billing/repositories/billing-sources.repository';
import { BillingSeriesService } from '../src/modules/billing/services/billing-series.service';

describe('BillingSeriesService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: BillingSeriesService;
  let tenantId: string;
  let otherTenantId: string;
  let branchId: string;
  let otherBranchId: string;

  const at = new Date('2026-06-15T15:00:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    service = new BillingSeriesService(
      new BillingSeriesRepository(prisma),
      new BillingSourcesRepository(prisma),
    );
    const createTenant = async () => {
      const tenant = await prisma.tenant.create({
        data: { name: `TEST series ${randomUUID()}` },
        select: { id: true },
      });
      const branch = await prisma.branch.create({
        data: { tenantId: tenant.id, name: 'Central' },
        select: { id: true },
      });
      return { tenantId: tenant.id, branchId: branch.id };
    };
    ({ tenantId, branchId } = await createTenant());
    ({ tenantId: otherTenantId, branchId: otherBranchId } =
      await createTenant());
  });

  afterAll(async () => {
    if (!prisma) return;
    const tenants = [tenantId, otherTenantId].filter(Boolean);
    const where = { tenantId: { in: tenants } };
    await prisma.invoice.deleteMany({ where });
    await prisma.billingSeries.deleteMany({ where });
    await prisma.branch.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    const where = { tenantId: { in: [tenantId, otherTenantId] } };
    await prisma.invoice.deleteMany({ where });
    await prisma.billingSeries.deleteMany({ where });
  });

  const createSeries = (
    overrides: Partial<Parameters<BillingSeriesService['create']>[1]> = {},
    tenant = tenantId,
    branch = branchId,
  ) =>
    service.create(tenant, {
      branchId: branch,
      modality: 'SELF_PRINTED',
      timbrado: '12345678',
      validFrom: '2026-01-01',
      validUntil: '2026-12-31',
      establecimiento: '001',
      puntoExpedicion: '001',
      rangeFrom: 1,
      rangeTo: 3,
      ...overrides,
    });

  it('gives distinct numbers to simultaneous issuances and stops at the end of the range', async () => {
    await createSeries();

    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        prisma.$transaction((tx) =>
          service.numberForIssue(tenantId, { branchId, at }, tx),
        ),
      ),
    );

    const numbers = outcomes
      .filter((o) => o.status === 'fulfilled')
      .map((o) => o.value.sequential)
      .sort();
    expect(numbers).toEqual([1, 2, 3]);
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(rejected).toHaveLength(2);
    expect(String(rejected[0].reason)).toContain('Se agotó el rango');
  });

  it('rolls back the number when the issuance transaction fails', async () => {
    await createSeries();

    await expect(
      prisma.$transaction(async (tx) => {
        await service.numberForIssue(tenantId, { branchId, at }, tx);
        throw new Error('PDF failed');
      }),
    ).rejects.toThrow('PDF failed');

    const numbering = await prisma.$transaction((tx) =>
      service.numberForIssue(tenantId, { branchId, at }, tx),
    );
    expect(numbering.sequential).toBe(1);
  });

  it('never stores the same talonario number twice in a series', async () => {
    const series = await createSeries({
      modality: 'PREPRINTED',
      rangeTo: 500,
    });
    await prisma.invoice.create({
      data: {
        tenantId,
        total: 1000,
        seriesId: series.id,
        sequential: 41,
      },
    });

    await expect(
      prisma.$transaction((tx) =>
        service.numberForIssue(
          tenantId,
          { branchId, at, documentNumber: 41 },
          tx,
        ),
      ),
    ).rejects.toThrow('ya fue usado');
    await expect(
      prisma.invoice.create({
        data: {
          tenantId,
          total: 1000,
          seriesId: series.id,
          sequential: 41,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const numbering = await prisma.$transaction((tx) =>
      service.numberForIssue(
        tenantId,
        { branchId, at, documentNumber: 42 },
        tx,
      ),
    );
    expect(numbering.sequential).toBe(42);
    const stored = await prisma.billingSeries.findUniqueOrThrow({
      where: { id: series.id },
    });
    expect(stored.nextNumber).toBe(43);
  });

  it('does not let a tenant use or read another tenant’s series', async () => {
    const foreign = await createSeries({}, otherTenantId, otherBranchId);

    await expect(
      prisma.$transaction((tx) =>
        service.numberForIssue(
          tenantId,
          { branchId, at, seriesId: foreign.id },
          tx,
        ),
      ),
    ).rejects.toThrow('no corresponde a la sucursal');
    await expect(service.findOne(tenantId, foreign.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(tenantId, foreign.id, { isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(createSeries({}, tenantId, otherBranchId)).rejects.toThrow(
      'La sucursal no existe',
    );

    const stored = await prisma.billingSeries.findUniqueOrThrow({
      where: { id: foreign.id },
    });
    expect(stored.nextNumber).toBe(1);
    expect(stored.isActive).toBe(true);
  });

  it('rejects a second series with the same timbrado, establecimiento and punto', async () => {
    await createSeries();

    await expect(createSeries()).rejects.toBeInstanceOf(ConflictException);
    await expect(
      createSeries({ puntoExpedicion: '002' }),
    ).resolves.toMatchObject({ puntoExpedicion: '002' });
  });
});
