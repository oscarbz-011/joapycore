/**
 * Integración contra PostgreSQL real: una nota de crédito se numera con su
 * serie, descuenta la cuenta por cobrar, reingresa el stock y no deja que
 * dos notas simultáneas se pasen del total de la factura.
 *
 * Requiere DATABASE_URL apuntando a una base desechable con el esquema aplicado.
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { EventBus } from '../src/common/events/event-bus';
import { PrismaService } from '../src/prisma/prisma.service';
import { BillingEventsRepository } from '../src/modules/billing/repositories/billing-events.repository';
import { BillingSeriesRepository } from '../src/modules/billing/repositories/billing-series.repository';
import { BillingSourcesRepository } from '../src/modules/billing/repositories/billing-sources.repository';
import { CreditNotesRepository } from '../src/modules/billing/repositories/credit-notes.repository';
import { CreditSettlementsRepository } from '../src/modules/billing/repositories/credit-settlements.repository';
import { InvoicesRepository } from '../src/modules/billing/repositories/invoices.repository';
import { BillingSeriesService } from '../src/modules/billing/services/billing-series.service';
import { CreditNotesService } from '../src/modules/billing/services/credit-notes.service';
import { InstallmentsRepository } from '../src/modules/finance/repositories/installments.repository';
import { LoansRepository } from '../src/modules/finance/repositories/loans.repository';
import { LoanCreditsService } from '../src/modules/finance/services/loan-credits.service';
import { ProductUnitsRepository } from '../src/modules/inventory/repositories/product-units.repository';
import { StockLocationsRepository } from '../src/modules/inventory/repositories/stock-locations.repository';
import { StockMovementsRepository } from '../src/modules/inventory/repositories/stock-movements.repository';
import { StockSourcesRepository } from '../src/modules/inventory/repositories/stock-sources.repository';
import { StockLedgerService } from '../src/modules/inventory/services/stock-ledger.service';
import { AccountsReceivableRepository } from '../src/modules/payments/repositories/accounts-receivable.repository';
import { ReceivablesService } from '../src/modules/payments/services/receivables.service';
import { createOutbox } from './support/outbox';

describe('CreditNotesService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: CreditNotesService;
  let tenantId: string;
  let otherTenantId: string;
  let branchId: string;
  let customerId: string;
  let warehouseId: string;
  let productId: string;

  const at = new Date('2026-06-15T15:00:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    const series = new BillingSeriesService(
      new BillingSeriesRepository(prisma),
      new BillingSourcesRepository(prisma),
    );
    const stockLedger = new StockLedgerService(
      new StockMovementsRepository(prisma),
      new ProductUnitsRepository(prisma),
      new StockLocationsRepository(prisma),
      new StockSourcesRepository(prisma),
    );
    service = new CreditNotesService(
      prisma,
      new InvoicesRepository(prisma),
      new CreditNotesRepository(prisma),
      new CreditSettlementsRepository(prisma),
      new BillingEventsRepository(prisma),
      series,
      { generate: () => Promise.resolve(null) } as never,
      { getById: () => Promise.resolve({}) } as never,
      createOutbox(prisma).outbox,
      new EventBus(new EventEmitter2()),
      new ReceivablesService(new AccountsReceivableRepository(prisma)),
      new LoanCreditsService(
        new LoansRepository(prisma),
        new InstallmentsRepository(prisma),
      ),
      stockLedger,
    );

    tenantId = (
      await prisma.tenant.create({
        data: { name: `TEST nc ${randomUUID()}` },
        select: { id: true },
      })
    ).id;
    otherTenantId = (
      await prisma.tenant.create({
        data: { name: `TEST nc ${randomUUID()}` },
        select: { id: true },
      })
    ).id;
    branchId = (
      await prisma.branch.create({
        data: { tenantId, name: 'Central' },
        select: { id: true },
      })
    ).id;
    customerId = (
      await prisma.customer.create({
        data: { tenantId, firstName: 'Maria', lastName: 'Perez' },
        select: { id: true },
      })
    ).id;
    warehouseId = (
      await prisma.warehouse.create({
        data: { tenantId, name: `TEST depósito ${randomUUID()}` },
        select: { id: true },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: { tenantId, name: 'Heladera', status: 'ACTIVE' },
        select: { id: true },
      })
    ).id;
    await prisma.billingSeries.create({
      data: {
        tenantId,
        branchId,
        documentType: 'CREDIT_NOTE',
        modality: 'SELF_PRINTED',
        timbrado: '87654321',
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validUntil: new Date('2027-12-31T00:00:00.000Z'),
        establecimiento: '001',
        puntoExpedicion: '001',
        rangeFrom: 1,
        rangeTo: 500,
        nextNumber: 1,
      },
    });
  });

  const removeDocuments = async (tenants: string[]) => {
    const where = { tenantId: { in: tenants } };
    await prisma.outboxEvent.deleteMany({ where });
    await prisma.billingDocumentEvent.deleteMany({ where });
    await prisma.customerCreditEntry.deleteMany({ where });
    await prisma.billingRefund.deleteMany({ where });
    await prisma.creditNoteItem.deleteMany({ where: { creditNote: where } });
    await prisma.creditNote.deleteMany({ where });
    await prisma.accountsReceivable.deleteMany({ where });
    await prisma.invoiceItem.deleteMany({ where: { invoice: where } });
    await prisma.invoice.deleteMany({ where });
    await prisma.stockMovement.deleteMany({ where });
    await prisma.saleOrderItem.deleteMany({ where: { saleOrder: where } });
    await prisma.saleOrder.deleteMany({ where });
  };

  afterEach(() => removeDocuments([tenantId]));

  afterAll(async () => {
    if (!prisma) return;
    const tenants = [tenantId, otherTenantId].filter(Boolean);
    const where = { tenantId: { in: tenants } };
    await removeDocuments(tenants);
    await prisma.billingSeries.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.warehouse.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.branch.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.$disconnect();
  });

  /** Factura de contado emitida, con su cuenta por cobrar. */
  async function issuedInvoice(paid = 0) {
    const order = await prisma.saleOrder.create({
      data: {
        tenantId,
        customerId,
        branchId,
        status: 'DELIVERED',
        orderDate: at,
        total: 2_200_000,
        items: {
          create: [
            {
              productId,
              warehouseId,
              quantity: 2,
              unitPrice: 1_100_000,
            },
          ],
        },
      },
      select: { id: true, items: { select: { id: true } } },
    });
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        saleOrderId: order.id,
        status: 'ISSUED',
        total: 2_200_000,
        issuedAt: at,
        invoicePrefix: '001-002-',
        invoiceNumber: '0000009',
        items: {
          create: [
            {
              description: 'Heladera',
              quantity: 2,
              unitPrice: 1_100_000,
              total: 2_200_000,
              ivaRate: 10,
              ivaAmount: 200_000,
              saleOrderItemId: order.items[0].id,
            },
          ],
        },
      },
      select: { id: true, items: { select: { id: true } } },
    });
    await prisma.accountsReceivable.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        amount: 2_200_000,
        paidAmount: paid,
        status: paid > 0 ? 'PARTIAL' : 'PENDING',
      },
    });
    return { invoiceId: invoice.id, itemId: invoice.items[0].id };
  }

  it('numbers the note, lowers the receivable and puts the returned unit back in stock', async () => {
    const { invoiceId, itemId } = await issuedInvoice();

    const note = await service.issue(tenantId, invoiceId, {
      kind: 'ITEMS',
      reason: 'Devolvió una heladera',
      items: [{ invoiceItemId: itemId, quantity: 1 }],
      restock: [{ invoiceItemId: itemId, quantity: 1 }],
    });

    expect(note).toMatchObject({
      numberPrefix: '001-001-',
      number: '0000001',
      kind: 'ITEMS',
    });
    expect(Number(note.total)).toBe(1_100_000);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(Number(invoice.creditedTotal)).toBe(1_100_000);
    const ar = await prisma.accountsReceivable.findFirstOrThrow({
      where: { invoiceId },
    });
    expect(Number(ar.amount)).toBe(1_100_000);
    expect(ar.status).toBe('PENDING');
    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { tenantId, referenceId: note.id },
    });
    expect(movement).toMatchObject({
      type: 'IN',
      reason: 'CUSTOMER_RETURN',
      quantity: 1,
      productId,
      warehouseId,
    });
    expect(note.events.map((e) => e.type)).toEqual(['CREDIT_NOTE_ISSUED']);
  });

  it('keeps what the customer already paid as credit in their favour', async () => {
    const { invoiceId } = await issuedInvoice(2_000_000);

    await service.issue(tenantId, invoiceId, {
      kind: 'TOTAL',
      reason: 'Se anula la venta',
      excess: { mode: 'CUSTOMER_CREDIT' },
    });

    const ar = await prisma.accountsReceivable.findFirstOrThrow({
      where: { invoiceId },
    });
    expect(Number(ar.amount)).toBe(2_000_000);
    expect(ar.status).toBe('PAID');
    const credit = await service.customerCredit(tenantId, customerId);
    expect(credit.balance).toBe(2_000_000);
  });

  it('never lets two notes at the same time credit more than the invoice', async () => {
    const { invoiceId, itemId } = await issuedInvoice();

    const results = await Promise.allSettled(
      [1, 2].map(() =>
        service.issue(tenantId, invoiceId, {
          kind: 'ITEMS',
          reason: 'Devolución',
          items: [{ invoiceItemId: itemId, quantity: 2 }],
        }),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(Number(invoice.creditedTotal)).toBe(2_200_000);
    expect(await prisma.creditNote.count({ where: { invoiceId } })).toBe(1);
  });

  it('voids an uncollected invoice without a credit note', async () => {
    const { invoiceId } = await issuedInvoice();

    await service.voidInvoice(tenantId, invoiceId, {
      reason: 'Se cargó al cliente equivocado',
    });

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.status).toBe('CANCELLED');
    expect(invoice.voidReason).toBe('Se cargó al cliente equivocado');
    expect(await prisma.creditNote.count({ where: { invoiceId } })).toBe(0);
  });

  it('does not credit nor void an invoice of another tenant', async () => {
    const { invoiceId } = await issuedInvoice();

    await expect(
      service.issue(otherTenantId, invoiceId, {
        kind: 'TOTAL',
        reason: 'Se anula',
      }),
    ).rejects.toThrow('Factura no encontrada');
    await expect(
      service.voidInvoice(otherTenantId, invoiceId, {
        reason: 'Error de carga',
      }),
    ).rejects.toThrow('Factura no encontrada');
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.status).toBe('ISSUED');
  });
});
