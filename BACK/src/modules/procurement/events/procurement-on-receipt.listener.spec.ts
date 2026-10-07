import { ProcurementOnReceiptListener } from './procurement-on-receipt.listener';
import { PurchaseReceiptsRepository } from '../repositories/purchase-receipts.repository';

function makeReceipt(overrides = {}) {
  return {
    id: 'receipt-1',
    tenantId: 'tenant-1',
    receivedAt: new Date('2026-08-01T00:00:00.000Z'),
    items: [
      { quantity: 5, unitCost: 100_000 },
      { quantity: 2, unitCost: 50_000 },
    ],
    purchaseOrder: {
      id: 'po-1',
      supplierId: 'supplier-1',
      supplier: { paymentTermDays: 30 },
    },
    ...overrides,
  };
}

describe('ProcurementOnReceiptListener', () => {
  let listener: ProcurementOnReceiptListener;
  let prisma: { purchaseReceipt: { findFirst: jest.Mock } };
  let apRepository: { findByPurchaseReceipt: jest.Mock; create: jest.Mock };
  let orders: {
    lockForAdvance: jest.Mock;
    advanceMovements: jest.Mock;
    advanceApplied: jest.Mock;
  };
  const tx = { tx: true };

  beforeEach(() => {
    prisma = { purchaseReceipt: { findFirst: jest.fn() } };
    apRepository = {
      findByPurchaseReceipt: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    };

    orders = {
      lockForAdvance: jest.fn(),
      advanceMovements: jest.fn().mockResolvedValue([]),
      advanceApplied: jest.fn().mockResolvedValue(0),
    };

    listener = new ProcurementOnReceiptListener(
      new PurchaseReceiptsRepository(prisma as any),
      apRepository as any,
      orders as any,
      { $transaction: jest.fn((cb) => cb(tx)) } as any,
    );
  });

  it('does nothing when the receipt no longer exists (defensive re-fetch)', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(null);

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'ghost',
    });

    expect(apRepository.create).not.toHaveBeenCalled();
  });

  it('is idempotent — skips if an AccountsPayable already exists for this receipt', async () => {
    apRepository.findByPurchaseReceipt.mockResolvedValue({ id: 'existing-ap' });

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'receipt-1',
    });

    expect(prisma.purchaseReceipt.findFirst).not.toHaveBeenCalled();
    expect(apRepository.create).not.toHaveBeenCalled();
  });

  it('creates an AccountsPayable with amount = sum(quantity * unitCost) and dueDate = receivedAt + paymentTermDays', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(makeReceipt());

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'receipt-1',
    });

    expect(apRepository.create).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        purchaseReceiptId: 'receipt-1',
        supplierId: 'supplier-1',
        amount: 600_000, // 5*100_000 + 2*50_000
        dueDate: new Date('2026-08-31T00:00:00.000Z'), // + 30 días
        paidAmount: 0,
        advanceApplied: 0,
        status: 'PENDING',
      },
      tx,
    );
  });

  describe('with an advance paid on the order', () => {
    const event = {
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'receipt-1',
    };

    beforeEach(() => {
      prisma.purchaseReceipt.findFirst.mockResolvedValue(makeReceipt());
    });

    it('takes the advance off the payable, leaving only the difference to pay', async () => {
      orders.advanceMovements.mockResolvedValue([
        { kind: 'ADVANCE', amount: 200_000 },
      ]);

      await listener.handle(event);

      expect(orders.lockForAdvance).toHaveBeenCalledWith(
        'tenant-1',
        'po-1',
        tx,
      );
      expect(orders.advanceMovements).toHaveBeenCalledWith(
        'tenant-1',
        'po-1',
        tx,
      );
      expect(apRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 600_000,
          paidAmount: 200_000,
          advanceApplied: 200_000,
          status: 'PARTIAL',
        }),
        tx,
      );
    });

    // Pago total por adelantado: la cuenta nace saldada.
    it('leaves the payable paid when the advance covers it', async () => {
      orders.advanceMovements.mockResolvedValue([
        { kind: 'ADVANCE', amount: 1_000_000 },
      ]);

      await listener.handle(event);

      expect(apRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          paidAmount: 600_000,
          advanceApplied: 600_000,
          status: 'PAID',
        }),
        tx,
      );
    });

    // Recepción parcial anterior: lo ya descontado no se descuenta dos veces.
    it('only uses what earlier receipts and refunds left available', async () => {
      orders.advanceMovements.mockResolvedValue([
        { kind: 'ADVANCE', amount: 500_000 },
        { kind: 'ADVANCE_REFUND', amount: 100_000 },
      ]);
      orders.advanceApplied.mockResolvedValue(300_000);

      await listener.handle(event);

      expect(apRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          paidAmount: 100_000,
          advanceApplied: 100_000,
          status: 'PARTIAL',
        }),
        tx,
      );
    });
  });

  it('defaults to paymentTermDays=0 (contado) when the supplier has none set', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(
      makeReceipt({
        purchaseOrder: {
          supplierId: 'supplier-1',
          supplier: { paymentTermDays: null },
        },
      }),
    );

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'receipt-1',
    });

    expect(apRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        dueDate: new Date('2026-08-01T00:00:00.000Z'),
      }),
      tx,
    );
  });

  it('logs and swallows errors instead of throwing (best-effort, never blocks the receipt)', async () => {
    prisma.purchaseReceipt.findFirst.mockRejectedValue(new Error('boom'));

    await expect(
      listener.handle({
        tenantId: 'tenant-1',
        purchaseOrderId: 'po-1',
        purchaseReceiptId: 'receipt-1',
      }),
    ).resolves.toBeUndefined();
  });
});
