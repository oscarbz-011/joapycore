/**
 * Integración contra PostgreSQL real: la factura de caja se guarda en la
 * misma transacción que la venta, numerada por la serie de la caja.
 *
 * Requiere DATABASE_URL apuntando a una base desechable con el esquema aplicado.
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventBus } from '../src/common/events/event-bus';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { createOutbox } from './support/outbox';
import { BillingSeriesRepository } from '../src/modules/billing/repositories/billing-series.repository';
import { BillingSourcesRepository } from '../src/modules/billing/repositories/billing-sources.repository';
import { InvoicesRepository } from '../src/modules/billing/repositories/invoices.repository';
import { BillingSeriesService } from '../src/modules/billing/services/billing-series.service';
import { PosInvoicingService } from '../src/modules/billing/services/pos-invoicing.service';

describe('PosInvoicingService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: PosInvoicingService;
  let tenantId: string;
  let otherTenantId: string;
  let branchId: string;
  let customerId: string;

  const at = new Date('2026-06-15T15:00:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    const seriesRepository = new BillingSeriesRepository(prisma);
    const sources = new BillingSourcesRepository(prisma);
    service = new PosInvoicingService(
      seriesRepository,
      new BillingSeriesService(seriesRepository, sources),
      new InvoicesRepository(prisma),
      sources,
      createOutbox(prisma).outbox,
      new EventBus(new EventEmitter2()),
    );

    const tenant = await prisma.tenant.create({
      data: {
        name: `TEST pos ${randomUUID()}`,
        razonSocial: 'Mi Empresa S.A.',
      },
      select: { id: true },
    });
    tenantId = tenant.id;
    const other = await prisma.tenant.create({
      data: { name: `TEST pos ${randomUUID()}` },
      select: { id: true },
    });
    otherTenantId = other.id;
    branchId = (
      await prisma.branch.create({
        data: { tenantId, name: 'Central' },
        select: { id: true },
      })
    ).id;
    customerId = (
      await prisma.customer.create({
        data: { tenantId, firstName: 'Consumidor', lastName: 'Final' },
        select: { id: true },
      })
    ).id;
  });

  const removeSales = async (tenants: string[]) => {
    const where = { tenantId: { in: tenants } };
    await prisma.outboxEvent.deleteMany({ where });
    await prisma.invoiceItem.deleteMany({ where: { invoice: where } });
    await prisma.invoice.deleteMany({ where });
    await prisma.saleOrderItem.deleteMany({ where: { saleOrder: where } });
    await prisma.saleOrder.deleteMany({ where });
    await prisma.billingSeries.deleteMany({ where });
  };

  afterAll(async () => {
    if (!prisma) return;
    const tenants = [tenantId, otherTenantId].filter(Boolean);
    const where = { tenantId: { in: tenants } };
    await removeSales(tenants);
    await prisma.customer.deleteMany({ where });
    await prisma.branch.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.$disconnect();
  });

  afterEach(() => removeSales([tenantId]));

  const createSeries = (modality: 'SELF_PRINTED' | 'PREPRINTED') =>
    prisma.billingSeries.create({
      data: {
        tenantId,
        branchId,
        documentType: 'INVOICE',
        modality,
        timbrado: '12345678',
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validUntil: new Date('2026-12-31T00:00:00.000Z'),
        establecimiento: '001',
        puntoExpedicion: '002',
        rangeFrom: 1,
        rangeTo: 500,
        nextNumber: 1,
      },
      select: { id: true },
    });

  const createOrder = (tx: Pick<PrismaService, 'saleOrder'> = prisma) =>
    tx.saleOrder.create({
      data: {
        tenantId,
        customerId,
        branchId,
        channel: 'POS',
        status: 'DELIVERED',
        orderDate: at,
        total: 220_000,
        items: {
          create: [
            { description: 'Licuadora', quantity: 2, unitPrice: 110_000 },
          ],
        },
      },
      select: { id: true },
    });

  const input = (
    saleOrderId: string,
    seriesId: string,
    documentNumber?: number,
  ) => ({
    saleOrderId,
    branchId,
    seriesId,
    documentNumber,
    anonymousBuyer: true,
    paymentMethod: 'CASH' as const,
    issuedById: 'cashier-1',
    at,
  });

  it('stores a paid invoice with its IVA and the invoice.issued event in the sale transaction', async () => {
    const series = await createSeries('SELF_PRINTED');

    const { invoiceId, saleOrderId } = await prisma.$transaction(async (tx) => {
      const order = await createOrder(tx);
      const issued = await service.issuePosInvoice(
        tx,
        tenantId,
        input(order.id, series.id),
      );
      return { ...issued, saleOrderId: order.id };
    });

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { items: true },
    });
    expect(invoice).toMatchObject({
      status: 'PAID',
      anonymousBuyer: true,
      invoicePrefix: '001-002-',
      invoiceNumber: '0000001',
      timbrado: '12345678',
    });
    expect(Number(invoice.items[0].ivaAmount)).toBe(20_000);
    expect(
      await prisma.outboxEvent.count({
        where: { tenantId, eventName: 'invoice.issued' },
      }),
    ).toBe(1);

    const receipt = await service.findReceiptBySaleOrder(tenantId, saleOrderId);
    expect(receipt?.buyer).toEqual({
      name: 'Sin Nombre',
      document: 'X',
      address: null,
    });
    expect(receipt?.totals.iva10).toBe(20_000);
  });

  it('rolls the sale back when the talonario number was already used', async () => {
    const series = await createSeries('PREPRINTED');
    await prisma.$transaction(async (tx) => {
      const order = await createOrder(tx);
      await service.issuePosInvoice(
        tx,
        tenantId,
        input(order.id, series.id, 41),
      );
    });

    await expect(
      prisma.$transaction(async (tx) => {
        const order = await createOrder(tx);
        await service.issuePosInvoice(
          tx,
          tenantId,
          input(order.id, series.id, 41),
        );
      }),
    ).rejects.toThrow();

    expect(await prisma.saleOrder.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.invoice.count({ where: { tenantId } })).toBe(1);
  });

  it('does not show the invoice to another tenant', async () => {
    const series = await createSeries('SELF_PRINTED');
    const saleOrderId = await prisma.$transaction(async (tx) => {
      const order = await createOrder(tx);
      await service.issuePosInvoice(tx, tenantId, input(order.id, series.id));
      return order.id;
    });

    await expect(
      service.findReceiptBySaleOrder(otherTenantId, saleOrderId),
    ).resolves.toBeNull();
    await expect(
      service.findSeries(otherTenantId, series.id),
    ).resolves.toBeNull();
  });
});
