/**
 * Integración contra PostgreSQL real: las hojas inutilizadas de un talonario
 * no se vuelven a usar y la factura pasa a otra hoja sin repetir números.
 *
 * Requiere DATABASE_URL apuntando a una base desechable con el esquema aplicado.
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { BillingSeriesRepository } from '../src/modules/billing/repositories/billing-series.repository';
import { BillingSourcesRepository } from '../src/modules/billing/repositories/billing-sources.repository';
import { InvoicesRepository } from '../src/modules/billing/repositories/invoices.repository';
import { BillingSeriesService } from '../src/modules/billing/services/billing-series.service';
import { PreprintedInvoicesService } from '../src/modules/billing/services/preprinted-invoices.service';

describe('PreprintedInvoicesService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let series: BillingSeriesService;
  let service: PreprintedInvoicesService;
  let tenantId: string;
  let otherTenantId: string;
  let branchId: string;
  let seriesId: string;

  const at = new Date('2026-06-15T15:00:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    series = new BillingSeriesService(
      new BillingSeriesRepository(prisma),
      new BillingSourcesRepository(prisma),
    );
    const files = { getById: () => Promise.resolve({}) };
    service = new PreprintedInvoicesService(
      prisma,
      new InvoicesRepository(prisma),
      series,
      files as never,
      new EventEmitter2(),
    );
    tenantId = (
      await prisma.tenant.create({
        data: { name: `TEST talonario ${randomUUID()}` },
        select: { id: true },
      })
    ).id;
    otherTenantId = (
      await prisma.tenant.create({
        data: { name: `TEST talonario ${randomUUID()}` },
        select: { id: true },
      })
    ).id;
    branchId = (
      await prisma.branch.create({
        data: { tenantId, name: 'Central' },
        select: { id: true },
      })
    ).id;
  });

  beforeEach(async () => {
    seriesId = (
      await prisma.billingSeries.create({
        data: {
          tenantId,
          branchId,
          modality: 'PREPRINTED',
          timbrado: '12345678',
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          validUntil: new Date('2026-12-31T00:00:00.000Z'),
          establecimiento: '001',
          puntoExpedicion: '002',
          rangeFrom: 1,
          rangeTo: 100,
          nextNumber: 42,
        },
        select: { id: true },
      })
    ).id;
  });

  afterEach(async () => {
    const where = { tenantId };
    await prisma.billingVoidedNumber.deleteMany({ where });
    await prisma.invoice.deleteMany({ where });
    await prisma.billingSeries.deleteMany({ where });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.branch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantId, otherTenantId].filter(Boolean) } },
    });
    await prisma.$disconnect();
  });

  const issuedOnSheet = (sequential: number) =>
    prisma.invoice.create({
      data: {
        tenantId,
        invoiceType: 'INTEREST',
        status: 'PAID',
        total: 110_000,
        issuedAt: at,
        seriesId,
        modality: 'PREPRINTED',
        timbrado: '12345678',
        establecimiento: '001',
        puntoExpedicion: '002',
        sequential,
        invoiceNumber: String(sequential).padStart(7, '0'),
        invoicePrefix: '001-002-',
        formPrintCount: 1,
      },
      select: { id: true },
    });

  it('voids the damaged sheet and moves the invoice to the next one', async () => {
    const invoice = await issuedOnSheet(41);

    await service.voidSheet(tenantId, invoice.id, { reason: 'Se trabó' });

    const moved = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(moved).toMatchObject({
      sequential: 42,
      invoiceNumber: '0000042',
      formPrintCount: 0,
    });
    const voided = await prisma.billingVoidedNumber.findMany({
      where: { tenantId },
    });
    expect(voided).toEqual([
      expect.objectContaining({
        sequential: 41,
        invoiceId: invoice.id,
        reason: 'Se trabó',
      }),
    ]);
  });

  it('never hands out a voided sheet again', async () => {
    const invoice = await issuedOnSheet(41);
    await service.voidSheet(tenantId, invoice.id, { reason: 'Se trabó' });

    await expect(
      prisma.$transaction((tx) =>
        series.numberForIssue(
          tenantId,
          { branchId, seriesId, documentNumber: 41, at },
          tx,
        ),
      ),
    ).rejects.toThrow('ya fue usado o inutilizado');
    await expect(
      service.voidLooseSheet(tenantId, seriesId, {
        documentNumber: 41,
        reason: 'Otra vez',
      }),
    ).rejects.toThrow('ya fue usado o inutilizado');
  });

  it('gives a sheet to only one of two invoices moved at the same time', async () => {
    const first = await issuedOnSheet(10);
    const second = await issuedOnSheet(11);

    const outcomes = await Promise.allSettled([
      service.voidSheet(tenantId, first.id, {
        reason: 'Corrida',
        documentNumber: 50,
      }),
      service.voidSheet(tenantId, second.id, {
        reason: 'Corrida',
        documentNumber: 50,
      }),
    ]);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.invoice.count({ where: { tenantId, sequential: 50 } }),
    ).toBe(1);
    expect(
      await prisma.billingVoidedNumber.count({ where: { tenantId } }),
    ).toBe(1);
  });

  it('does not print an invoice of another tenant', async () => {
    const invoice = await issuedOnSheet(41);
    await expect(
      service.print(otherTenantId, invoice.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      series.findVoided(otherTenantId, seriesId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
