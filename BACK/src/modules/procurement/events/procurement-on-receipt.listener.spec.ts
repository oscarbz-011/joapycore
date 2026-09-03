import { ProcurementOnReceiptListener } from './procurement-on-receipt.listener';

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

  beforeEach(() => {
    prisma = { purchaseReceipt: { findFirst: jest.fn() } };
    apRepository = {
      findByPurchaseReceipt: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    };

    listener = new ProcurementOnReceiptListener(
      prisma as any,
      apRepository as any,
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

    expect(apRepository.create).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      purchaseReceiptId: 'receipt-1',
      supplierId: 'supplier-1',
      amount: 600_000, // 5*100_000 + 2*50_000
      dueDate: new Date('2026-08-31T00:00:00.000Z'), // + 30 días
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
