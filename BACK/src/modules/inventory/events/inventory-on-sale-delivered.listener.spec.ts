import { InventoryOnSaleDeliveredListener } from './inventory-on-sale-delivered.listener';
import { StockMovementsRepository } from '../repositories/stock-movements.repository';
import { StockSourcesRepository } from '../repositories/stock-sources.repository';

function makeOrder(overrides = {}) {
  return {
    id: 'order-1',
    tenantId: 'tenant-1',
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        quantity: 6,
        product: { isSerialized: false, usesLots: true },
      },
    ],
    ...overrides,
  };
}

describe('InventoryOnSaleDeliveredListener', () => {
  let listener: InventoryOnSaleDeliveredListener;
  let prisma: { saleOrder: { findFirst: jest.Mock }; $transaction: jest.Mock };
  let stockEntryService: { consumeFifo: jest.Mock };
  let tx: {
    stockMovement: { findFirst: jest.Mock };
    saleOrderItem: { update: jest.Mock };
  };

  beforeEach(() => {
    tx = {
      stockMovement: { findFirst: jest.fn().mockResolvedValue(null) },
      saleOrderItem: { update: jest.fn() },
    };
    prisma = {
      saleOrder: { findFirst: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    stockEntryService = { consumeFifo: jest.fn() };

    listener = new InventoryOnSaleDeliveredListener(
      prisma as any,
      stockEntryService as any,
      new StockSourcesRepository(prisma as any),
      new StockMovementsRepository(prisma as any),
    );
  });

  it('does nothing when the order no longer exists', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue(null);

    await listener.handle({ tenantId: 'tenant-1', saleOrderId: 'ghost' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('consumes FIFO for a lot-managed, non-serialized item and stamps batchId', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue(makeOrder());
    stockEntryService.consumeFifo.mockResolvedValue('batch-old');

    await listener.handle({ tenantId: 'tenant-1', saleOrderId: 'order-1' });

    expect(stockEntryService.consumeFifo).toHaveBeenCalledWith(
      'tenant-1',
      'prod-1',
      6,
      'item-1',
      tx,
    );
    expect(tx.saleOrderItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { batchId: 'batch-old' },
    });
  });

  it('skips serialized items entirely', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue(
      makeOrder({
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 1,
            product: { isSerialized: true, usesLots: true },
          },
        ],
      }),
    );

    await listener.handle({ tenantId: 'tenant-1', saleOrderId: 'order-1' });

    expect(stockEntryService.consumeFifo).not.toHaveBeenCalled();
  });

  it('skips items whose product does not use lots', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue(
      makeOrder({
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 1,
            product: { isSerialized: false, usesLots: false },
          },
        ],
      }),
    );

    await listener.handle({ tenantId: 'tenant-1', saleOrderId: 'order-1' });

    expect(stockEntryService.consumeFifo).not.toHaveBeenCalled();
  });

  it('is idempotent — replaying the event does not double-consume a line already tied to a batch', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue(makeOrder());
    tx.stockMovement.findFirst.mockResolvedValue({
      id: 'existing-out-movement',
    });

    await listener.handle({ tenantId: 'tenant-1', saleOrderId: 'order-1' });

    expect(stockEntryService.consumeFifo).not.toHaveBeenCalled();
  });
});
