import { InventoryOnPurchaseReceiptListener } from './inventory-on-purchase-receipt.listener';

function makeReceipt(overrides = {}) {
  return {
    id: 'receipt-1',
    tenantId: 'tenant-1',
    warehouseId: 'wh-1',
    items: [
      {
        id: 'ritem-1',
        productId: 'prod-1',
        purchaseOrderItemId: 'poitem-1',
        quantity: 5,
        unitCost: 100_000,
        batchNumber: null,
        expiresAt: null,
        serialNumbers: [],
        product: { isSerialized: false, usesLots: false },
      },
    ],
    ...overrides,
  };
}

describe('InventoryOnPurchaseReceiptListener', () => {
  let listener: InventoryOnPurchaseReceiptListener;
  let prisma: {
    purchaseReceipt: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let stockEntryService: { registerEntry: jest.Mock };
  let tx: {
    stockMovement: { findFirst: jest.Mock };
    productUnit: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    tx = {
      stockMovement: { findFirst: jest.fn().mockResolvedValue(null) },
      productUnit: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma = {
      purchaseReceipt: { findFirst: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    stockEntryService = { registerEntry: jest.fn() };

    listener = new InventoryOnPurchaseReceiptListener(
      prisma as any,
      stockEntryService as any,
    );
  });

  it('does nothing when the receipt no longer exists (defensive re-fetch)', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(null);

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'ghost',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('registers a stock entry per receipt item with the correct fields', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(makeReceipt());

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'receipt-1',
    });

    expect(stockEntryService.registerEntry).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        productId: 'prod-1',
        quantity: 5,
        reason: 'PURCHASE',
        warehouseId: 'wh-1',
        referenceId: 'ritem-1',
        unitCost: 100_000,
        purchaseOrderItemId: 'poitem-1',
        purchaseReceiptItemId: 'ritem-1',
      }),
      tx,
    );
  });

  it('is idempotent — skips if this receipt already generated movements', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(makeReceipt());
    tx.stockMovement.findFirst.mockResolvedValue({ id: 'existing-movement' });

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'receipt-1',
    });

    expect(stockEntryService.registerEntry).not.toHaveBeenCalled();
  });

  it('passes serial numbers only for serialized products', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(
      makeReceipt({
        items: [
          {
            id: 'ritem-1',
            productId: 'prod-1',
            purchaseOrderItemId: 'poitem-1',
            quantity: 2,
            unitCost: 500_000,
            batchNumber: null,
            expiresAt: null,
            serialNumbers: ['SN1', 'SN2'],
            product: { isSerialized: true, usesLots: false },
          },
        ],
      }),
    );

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'receipt-1',
    });

    expect(stockEntryService.registerEntry).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ serialNumbers: ['SN1', 'SN2'] }),
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
