import { BillingSourcesRepository } from '../repositories/billing-sources.repository';
import { InterestInvoiceOnReceiptListener } from './interest-invoice-on-receipt.listener';

const TENANT = 'tenant-1';
const RECEIPT_ID = 'receipt-1';

function makeReceipt(overrides: Record<string, unknown> = {}) {
  return {
    id: RECEIPT_ID,
    tenantId: TENANT,
    branchId: 'branch-1',
    issuedAt: new Date('2026-08-26'),
    items: [],
    loan: {
      saleOrder: {
        invoice: { invoicePrefix: '001-001-', invoiceNumber: '0000011' },
      },
    },
    ...overrides,
  };
}

describe('InterestInvoiceOnReceiptListener', () => {
  let prisma: { paymentReceipt: { findFirst: jest.Mock } };
  let invoicesService: { createInterestInvoiceFromReceipt: jest.Mock };
  let listener: InterestInvoiceOnReceiptListener;

  beforeEach(() => {
    prisma = { paymentReceipt: { findFirst: jest.fn() } };
    invoicesService = {
      createInterestInvoiceFromReceipt: jest.fn().mockResolvedValue({}),
    };
    listener = new InterestInvoiceOnReceiptListener(
      new BillingSourcesRepository(prisma as any),
      invoicesService as any,
    );
  });

  it('does nothing if the receipt has no INTEREST_COMPONENT items', async () => {
    prisma.paymentReceipt.findFirst.mockResolvedValue(
      makeReceipt({
        items: [
          { installmentNumber: 1, amountApplied: 200_000, kind: 'PRINCIPAL' },
        ],
      }),
    );

    await listener.handle({ tenantId: TENANT, receiptId: RECEIPT_ID });

    expect(
      invoicesService.createInterestInvoiceFromReceipt,
    ).not.toHaveBeenCalled();
  });

  it('does nothing if the receipt does not exist', async () => {
    prisma.paymentReceipt.findFirst.mockResolvedValue(null);

    await listener.handle({ tenantId: TENANT, receiptId: RECEIPT_ID });

    expect(
      invoicesService.createInterestInvoiceFromReceipt,
    ).not.toHaveBeenCalled();
  });

  it('creates one item per installment, summing all its interest components', async () => {
    prisma.paymentReceipt.findFirst.mockResolvedValue(
      makeReceipt({
        items: [
          { installmentNumber: 1, amountApplied: 300_000, kind: 'PRINCIPAL' },
          {
            installmentNumber: 1,
            amountApplied: 50_000,
            kind: 'INTEREST_COMPONENT',
            componentName: 'Gastos administrativos',
          },
          {
            installmentNumber: 1,
            amountApplied: 30_000,
            kind: 'INTEREST_COMPONENT',
            componentName: 'Interés moratorio',
          },
        ],
      }),
    );

    await listener.handle({ tenantId: TENANT, receiptId: RECEIPT_ID });

    expect(
      invoicesService.createInterestInvoiceFromReceipt,
    ).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        paymentReceiptId: RECEIPT_ID,
        branchId: 'branch-1',
        items: [
          expect.objectContaining({
            description: expect.stringContaining('cuota N° 1'),
            total: 80_000,
            unitPrice: 80_000,
            quantity: 1,
          }),
        ],
      }),
    );
  });

  it('includes the original sale invoice number in the description', async () => {
    prisma.paymentReceipt.findFirst.mockResolvedValue(
      makeReceipt({
        items: [
          {
            installmentNumber: 3,
            amountApplied: 10_000,
            kind: 'INTEREST_COMPONENT',
          },
        ],
      }),
    );

    await listener.handle({ tenantId: TENANT, receiptId: RECEIPT_ID });

    const call =
      invoicesService.createInterestInvoiceFromReceipt.mock.calls[0][1];
    expect(call.items[0].description).toBe(
      'Intereses moratorios correspondientes a la cuota N° 3 de la Factura a Crédito N° 001-001-0000011',
    );
  });

  it('omits the invoice reference when the sale order has no invoice yet (cash-sale edge case)', async () => {
    prisma.paymentReceipt.findFirst.mockResolvedValue(
      makeReceipt({
        loan: { saleOrder: { invoice: null } },
        items: [
          {
            installmentNumber: 1,
            amountApplied: 10_000,
            kind: 'INTEREST_COMPONENT',
          },
        ],
      }),
    );

    await listener.handle({ tenantId: TENANT, receiptId: RECEIPT_ID });

    const call =
      invoicesService.createInterestInvoiceFromReceipt.mock.calls[0][1];
    expect(call.items[0].description).toBe(
      'Intereses moratorios correspondientes a la cuota N° 1',
    );
  });

  it('groups multiple installments covered by the same payment into separate items, sorted by installment number', async () => {
    prisma.paymentReceipt.findFirst.mockResolvedValue(
      makeReceipt({
        items: [
          {
            installmentNumber: 2,
            amountApplied: 20_000,
            kind: 'INTEREST_COMPONENT',
          },
          {
            installmentNumber: 1,
            amountApplied: 10_000,
            kind: 'INTEREST_COMPONENT',
          },
        ],
      }),
    );

    await listener.handle({ tenantId: TENANT, receiptId: RECEIPT_ID });

    const call =
      invoicesService.createInterestInvoiceFromReceipt.mock.calls[0][1];
    expect(call.items).toHaveLength(2);
    expect(call.items[0].total).toBe(10_000);
    expect(call.items[1].total).toBe(20_000);
  });

  it('computes the 10% IVA-included breakdown per item', async () => {
    prisma.paymentReceipt.findFirst.mockResolvedValue(
      makeReceipt({
        items: [
          {
            installmentNumber: 1,
            amountApplied: 110_000,
            kind: 'INTEREST_COMPONENT',
          },
        ],
      }),
    );

    await listener.handle({ tenantId: TENANT, receiptId: RECEIPT_ID });

    const item =
      invoicesService.createInterestInvoiceFromReceipt.mock.calls[0][1]
        .items[0];
    expect(item.ivaRate).toBe(10);
    expect(item.ivaAmount).toBe(10_000);
    expect(item.unitPriceWithoutIva).toBe(100_000);
  });

  it('is best-effort — does not throw if the invoice service rejects', async () => {
    prisma.paymentReceipt.findFirst.mockResolvedValue(
      makeReceipt({
        items: [
          {
            installmentNumber: 1,
            amountApplied: 10_000,
            kind: 'INTEREST_COMPONENT',
          },
        ],
      }),
    );
    invoicesService.createInterestInvoiceFromReceipt.mockRejectedValue(
      new Error('boom'),
    );

    await expect(
      listener.handle({ tenantId: TENANT, receiptId: RECEIPT_ID }),
    ).resolves.toBeUndefined();
  });
});
