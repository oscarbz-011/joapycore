import { PaymentsOnInvoiceListener } from './payments-on-invoice.listener';

function makeAR(overrides = {}) {
  return {
    id: 'ar-1',
    tenantId: 'tenant-1',
    invoiceId: 'inv-1',
    amount: 2_500_000,
    paidAmount: 0,
    status: 'PENDING' as const,
    dueDate: null,
    ...overrides,
  };
}

describe('PaymentsOnInvoiceListener', () => {
  let listener: PaymentsOnInvoiceListener;
  let prisma: { invoice: { findUnique: jest.Mock } };
  let arRepository: {
    findByInvoice: jest.Mock;
    create: jest.Mock;
    updateStatus: jest.Mock;
  };

  beforeEach(() => {
    prisma = { invoice: { findUnique: jest.fn() } };
    arRepository = {
      findByInvoice: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'ar-1' }),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    listener = new PaymentsOnInvoiceListener(
      prisma as any,
      arRepository as any,
    );
  });

  // ── invoice.issued → create AR ─────────────────────────────────────────────

  describe('handle (invoice.issued)', () => {
    it('creates an AR using invoice.total for cash sales', async () => {
      arRepository.findByInvoice.mockResolvedValue(null);
      prisma.invoice.findUnique.mockResolvedValue({
        total: 2_500_000,
        dueDate: null,
        saleOrder: { saleType: 'CASH', loan: null },
      });

      await listener.handle({
        tenantId: 'tenant-1',
        invoiceId: 'inv-1',
        saleOrderId: 'order-1',
      });

      expect(arRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          invoiceId: 'inv-1',
          amount: 2_500_000,
        }),
      );
    });

    it('creates an AR using loan.totalAmount for credit sales', async () => {
      arRepository.findByInvoice.mockResolvedValue(null);
      prisma.invoice.findUnique.mockResolvedValue({
        total: 2_500_000,
        dueDate: null,
        saleOrder: { saleType: 'CREDIT', loan: { totalAmount: 2_875_000 } },
      });

      await listener.handle({
        tenantId: 'tenant-1',
        invoiceId: 'inv-1',
        saleOrderId: 'order-1',
      });

      expect(arRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 2_875_000 }),
      );
    });

    it('falls back to invoice.total for credit sales when the loan has not been created yet', async () => {
      arRepository.findByInvoice.mockResolvedValue(null);
      prisma.invoice.findUnique.mockResolvedValue({
        total: 2_500_000,
        dueDate: null,
        saleOrder: { saleType: 'CREDIT', loan: null },
      });

      await listener.handle({
        tenantId: 'tenant-1',
        invoiceId: 'inv-1',
        saleOrderId: 'order-1',
      });

      expect(arRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 2_500_000 }),
      );
    });

    it('skips creation when AR already exists (idempotency)', async () => {
      arRepository.findByInvoice.mockResolvedValue(makeAR());

      await listener.handle({
        tenantId: 'tenant-1',
        invoiceId: 'inv-1',
        saleOrderId: 'order-1',
      });

      expect(arRepository.create).not.toHaveBeenCalled();
    });

    it('skips when invoice is not found', async () => {
      arRepository.findByInvoice.mockResolvedValue(null);
      prisma.invoice.findUnique.mockResolvedValue(null);

      await listener.handle({
        tenantId: 'tenant-1',
        invoiceId: 'inv-1',
        saleOrderId: 'order-1',
      });

      expect(arRepository.create).not.toHaveBeenCalled();
    });
  });

  // ── invoice.cancelled → cancel AR ─────────────────────────────────────────

  describe('handleCancelled (invoice.cancelled)', () => {
    it('cancels the AR when invoice is cancelled', async () => {
      arRepository.findByInvoice.mockResolvedValue(
        makeAR({ status: 'PENDING' }),
      );

      await listener.handleCancelled({
        tenantId: 'tenant-1',
        invoiceId: 'inv-1',
      });

      expect(arRepository.updateStatus).toHaveBeenCalledWith(
        'ar-1',
        'CANCELLED',
      );
    });

    it('skips when no AR exists for the invoice', async () => {
      arRepository.findByInvoice.mockResolvedValue(null);

      await listener.handleCancelled({
        tenantId: 'tenant-1',
        invoiceId: 'inv-1',
      });

      expect(arRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('skips when AR is already cancelled (idempotency)', async () => {
      arRepository.findByInvoice.mockResolvedValue(
        makeAR({ status: 'CANCELLED' }),
      );

      await listener.handleCancelled({
        tenantId: 'tenant-1',
        invoiceId: 'inv-1',
      });

      expect(arRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('also cancels a PARTIAL AR', async () => {
      arRepository.findByInvoice.mockResolvedValue(
        makeAR({ status: 'PARTIAL', paidAmount: 1_000_000 }),
      );

      await listener.handleCancelled({
        tenantId: 'tenant-1',
        invoiceId: 'inv-1',
      });

      expect(arRepository.updateStatus).toHaveBeenCalledWith(
        'ar-1',
        'CANCELLED',
      );
    });
  });
});
