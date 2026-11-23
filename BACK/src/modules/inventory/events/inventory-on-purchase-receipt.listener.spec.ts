import { InventoryOnPurchaseReceiptListener } from './inventory-on-purchase-receipt.listener';
import { ProductUnitsRepository } from '../repositories/product-units.repository';
import { StockMovementsRepository } from '../repositories/stock-movements.repository';
import { StockSourcesRepository } from '../repositories/stock-sources.repository';

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
        product: {
          isSerialized: false,
          usesLots: false,
          salesChannels: ['NORMAL'],
          salesChannelsOnReceipt: [],
        },
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
  let eventEmitter: { emit: jest.Mock };
  let tx: {
    stockMovement: { findFirst: jest.Mock };
    productUnit: { findFirst: jest.Mock };
    product: { updateMany: jest.Mock };
  };

  beforeEach(() => {
    tx = {
      stockMovement: { findFirst: jest.fn().mockResolvedValue(null) },
      productUnit: { findFirst: jest.fn().mockResolvedValue(null) },
      product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma = {
      purchaseReceipt: { findFirst: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    stockEntryService = { registerEntry: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    listener = new InventoryOnPurchaseReceiptListener(
      prisma as any,
      stockEntryService as any,
      new StockSourcesRepository(prisma as any),
      new StockMovementsRepository(prisma as any),
      new ProductUnitsRepository(prisma as any),
      eventEmitter as any,
    );
  });

  it('does nothing when the receipt no longer exists (defensive re-fetch)', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(null);

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'ghost',
      warehouseId: 'wh-1',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('registers a stock entry per receipt item with the correct fields', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(makeReceipt());

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'receipt-1',
      warehouseId: 'wh-1',
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

  // Las pantallas de stock, lotes y productos se refrescan con este aviso:
  // sale después de confirmar el ingreso, no al guardar la recepción.
  it('announces each stock entry once it is saved', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(makeReceipt());

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'receipt-1',
      warehouseId: 'wh-1',
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith('stock.movement.created', {
      tenantId: 'tenant-1',
      productId: 'prod-1',
      type: 'IN',
      quantity: 5,
    });
  });

  it('announces nothing when the stock entry fails', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(makeReceipt());
    stockEntryService.registerEntry.mockRejectedValue(new Error('boom'));

    await expect(
      listener.handle({
        tenantId: 'tenant-1',
        purchaseOrderId: 'po-1',
        purchaseReceiptId: 'receipt-1',
        warehouseId: 'wh-1',
      }),
    ).rejects.toThrow('boom');

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('is idempotent — skips if this receipt already generated movements', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(makeReceipt());
    tx.stockMovement.findFirst.mockResolvedValue({ id: 'existing-movement' });

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'receipt-1',
      warehouseId: 'wh-1',
    });

    expect(stockEntryService.registerEntry).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
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
            product: {
              isSerialized: true,
              usesLots: false,
              salesChannels: [],
              salesChannelsOnReceipt: [],
            },
          },
        ],
      }),
    );

    await listener.handle({
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'receipt-1',
      warehouseId: 'wh-1',
    });

    expect(stockEntryService.registerEntry).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ serialNumbers: ['SN1', 'SN2'] }),
      tx,
    );
  });

  // El outbox reintenta y, si se agotan los intentos, lo muestra en
  // "Procesos con errores": el error no se puede tragar acá.
  it('lets a failure reach the outbox so it is retried', async () => {
    prisma.purchaseReceipt.findFirst.mockRejectedValue(new Error('boom'));

    await expect(
      listener.handle({
        tenantId: 'tenant-1',
        purchaseOrderId: 'po-1',
        purchaseReceiptId: 'receipt-1',
        warehouseId: 'wh-1',
      }),
    ).rejects.toThrow('boom');
  });
  describe('products waiting for their first receipt to be sold', () => {
    const event = {
      tenantId: 'tenant-1',
      purchaseOrderId: 'po-1',
      purchaseReceiptId: 'receipt-1',
      warehouseId: 'wh-1',
    };

    function receiptOf(product: Record<string, unknown>) {
      const receipt = makeReceipt();
      Object.assign(receipt.items[0].product, product);
      return receipt;
    }

    it('opens the pending sales channels once the stock is in', async () => {
      prisma.purchaseReceipt.findFirst.mockResolvedValue(
        receiptOf({
          salesChannels: ['POS'],
          salesChannelsOnReceipt: ['NORMAL', 'POS'],
        }),
      );

      await listener.handle(event);

      expect(tx.product.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          id: 'prod-1',
          salesChannelsOnReceipt: { isEmpty: false },
        },
        data: {
          salesChannels: ['POS', 'NORMAL'],
          salesChannelsOnReceipt: [],
        },
      });
      expect(tx.product.updateMany.mock.invocationCallOrder[0]).toBeGreaterThan(
        stockEntryService.registerEntry.mock.invocationCallOrder[0],
      );
    });

    it('leaves products with nothing pending untouched', async () => {
      prisma.purchaseReceipt.findFirst.mockResolvedValue(
        receiptOf({ salesChannels: [], salesChannelsOnReceipt: [] }),
      );

      await listener.handle(event);

      expect(tx.product.updateMany).not.toHaveBeenCalled();
    });

    it('does not open them again for a receipt already processed', async () => {
      prisma.purchaseReceipt.findFirst.mockResolvedValue(
        receiptOf({ salesChannels: [], salesChannelsOnReceipt: ['NORMAL'] }),
      );
      tx.stockMovement.findFirst.mockResolvedValue({ id: 'mov-1' });

      await listener.handle(event);

      expect(tx.product.updateMany).not.toHaveBeenCalled();
    });
  });
});
