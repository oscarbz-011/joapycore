import { SaleOrdersRepository } from '../repositories/sale-orders.repository';
import { SalesOnBatchConsumedListener } from './sales-on-batch-consumed.listener';

describe('SalesOnBatchConsumedListener', () => {
  let prisma: { saleOrderItem: { updateMany: jest.Mock } };
  let listener: SalesOnBatchConsumedListener;

  beforeEach(() => {
    prisma = {
      saleOrderItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    listener = new SalesOnBatchConsumedListener(
      new SaleOrdersRepository(prisma as any),
    );
  });

  it('records the batch on each line of the same tenant', async () => {
    await listener.handle({
      tenantId: 'tenant-1',
      saleOrderId: 'order-1',
      lines: [
        { saleItemId: 'item-1', batchId: 'batch-1' },
        { saleItemId: 'item-2', batchId: 'batch-2' },
      ],
    });

    expect(prisma.saleOrderItem.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'item-1', tenantId: 'tenant-1' },
      data: { batchId: 'batch-1' },
    });
    expect(prisma.saleOrderItem.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'item-2', tenantId: 'tenant-1' },
      data: { batchId: 'batch-2' },
    });
  });

  it('can be replayed without changing the result', async () => {
    const event = {
      tenantId: 'tenant-1',
      saleOrderId: 'order-1',
      lines: [{ saleItemId: 'item-1', batchId: 'batch-1' }],
    };

    await listener.handle(event);
    await listener.handle(event);

    expect(prisma.saleOrderItem.updateMany.mock.calls).toEqual([
      [expect.objectContaining({ data: { batchId: 'batch-1' } })],
      [expect.objectContaining({ data: { batchId: 'batch-1' } })],
    ]);
  });
});
