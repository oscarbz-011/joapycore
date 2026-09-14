import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PurchaseReceiptsService } from './purchase-receipts.service';
import { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeOrderItem(overrides = {}) {
  return {
    id: 'item-1',
    purchaseOrderId: 'po-1',
    productId: 'prod-1',
    quantity: 10,
    receivedQty: 0,
    unitCost: 2_000_000,
    product: { id: 'prod-1', name: 'Heladera Samsung', isSerialized: false },
    ...overrides,
  };
}

function makeOrder(overrides = {}) {
  return {
    id: 'po-1',
    tenantId: 'tenant-1',
    status: 'CONFIRMED' as const,
    items: [makeOrderItem()],
    ...overrides,
  };
}

describe('PurchaseReceiptsService', () => {
  let service: PurchaseReceiptsService;
  let purchaseOrdersRepository: {
    findById: jest.Mock;
    updateItemReceivedQty: jest.Mock;
    findItems: jest.Mock;
    updateStatus: jest.Mock;
  };
  let purchaseReceiptsRepository: {
    nextReceiptNumber: jest.Mock;
    create: jest.Mock;
    findByOrder: jest.Mock;
    findById: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let prisma: { $transaction: jest.Mock };
  let tx: { purchaseOrderItem: { findMany: jest.Mock } };

  beforeEach(() => {
    purchaseOrdersRepository = {
      findById: jest.fn(),
      updateItemReceivedQty: jest.fn(),
      updateStatus: jest.fn(),
      // Implementación real: consulta el tx que recibe (mockeado abajo).
      findItems: jest.fn((orderId: string, client: any) =>
        new PurchaseOrdersRepository({} as any).findItems(orderId, client),
      ),
    };
    purchaseReceiptsRepository = {
      nextReceiptNumber: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue({ id: 'receipt-1' }),
      findByOrder: jest.fn(),
      findById: jest.fn().mockResolvedValue({ id: 'receipt-1' }),
    };
    eventEmitter = { emit: jest.fn() };
    tx = { purchaseOrderItem: { findMany: jest.fn().mockResolvedValue([]) } };
    prisma = { $transaction: jest.fn().mockImplementation((cb) => cb(tx)) };

    service = new PurchaseReceiptsService(
      prisma as any,
      purchaseOrdersRepository as any,
      purchaseReceiptsRepository as any,
      eventEmitter as any,
    );
  });

  it('throws UnprocessableEntityException when order is not CONFIRMED/PARTIALLY_RECEIVED', async () => {
    purchaseOrdersRepository.findById.mockResolvedValue(
      makeOrder({ status: 'PENDING' }),
    );

    await expect(
      service.create('tenant-1', 'po-1', {
        items: [{ purchaseOrderItemId: 'item-1', quantity: 5 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('throws NotFoundException when order does not exist', async () => {
    purchaseOrdersRepository.findById.mockResolvedValue(null);

    await expect(
      service.create('tenant-1', 'ghost', {
        items: [{ purchaseOrderItemId: 'item-1', quantity: 5 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a quantity greater than the pending balance', async () => {
    purchaseOrdersRepository.findById.mockResolvedValue(
      makeOrder({ items: [makeOrderItem({ quantity: 10, receivedQty: 8 })] }),
    );

    await expect(
      service.create('tenant-1', 'po-1', {
        items: [{ purchaseOrderItemId: 'item-1', quantity: 5 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects the same order line received twice in one payload', async () => {
    purchaseOrdersRepository.findById.mockResolvedValue(makeOrder());

    await expect(
      service.create('tenant-1', 'po-1', {
        items: [
          { purchaseOrderItemId: 'item-1', quantity: 3 },
          { purchaseOrderItemId: 'item-1', quantity: 2 },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects a serialized item whose serial count does not match quantity', async () => {
    purchaseOrdersRepository.findById.mockResolvedValue(
      makeOrder({
        items: [
          makeOrderItem({
            product: { id: 'prod-1', name: 'TV', isSerialized: true },
          }),
        ],
      }),
    );

    await expect(
      service.create('tenant-1', 'po-1', {
        items: [
          {
            purchaseOrderItemId: 'item-1',
            quantity: 3,
            serialNumbers: ['SN1', 'SN2'],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('creates a partial receipt and leaves the order PARTIALLY_RECEIVED', async () => {
    purchaseOrdersRepository.findById.mockResolvedValue(
      makeOrder({ items: [makeOrderItem({ quantity: 10, receivedQty: 0 })] }),
    );
    tx.purchaseOrderItem.findMany.mockResolvedValue([
      makeOrderItem({ quantity: 10, receivedQty: 4 }),
    ]);

    await service.create('tenant-1', 'po-1', {
      items: [{ purchaseOrderItemId: 'item-1', quantity: 4 }],
    });

    expect(purchaseOrdersRepository.updateItemReceivedQty).toHaveBeenCalledWith(
      'item-1',
      4,
      tx,
    );
    expect(purchaseOrdersRepository.updateStatus).toHaveBeenCalledWith(
      'tenant-1',
      'po-1',
      'PARTIALLY_RECEIVED',
      tx,
    );
  });

  it('transitions the order to RECEIVED once every item is fully received', async () => {
    purchaseOrdersRepository.findById.mockResolvedValue(
      makeOrder({ items: [makeOrderItem({ quantity: 10, receivedQty: 0 })] }),
    );
    tx.purchaseOrderItem.findMany.mockResolvedValue([
      makeOrderItem({ quantity: 10, receivedQty: 10 }),
    ]);

    await service.create('tenant-1', 'po-1', {
      items: [{ purchaseOrderItemId: 'item-1', quantity: 10 }],
    });

    expect(purchaseOrdersRepository.updateStatus).toHaveBeenCalledWith(
      'tenant-1',
      'po-1',
      'RECEIVED',
      tx,
    );
  });

  it('emits purchase.receipt.created and audit.log', async () => {
    purchaseOrdersRepository.findById.mockResolvedValue(makeOrder());
    tx.purchaseOrderItem.findMany.mockResolvedValue([
      makeOrderItem({ receivedQty: 10 }),
    ]);

    await service.create(
      'tenant-1',
      'po-1',
      {
        warehouseId: 'wh-1',
        items: [{ purchaseOrderItemId: 'item-1', quantity: 10 }],
      },
      'user-1',
    );

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'purchase.receipt.created',
      expect.objectContaining({
        tenantId: 'tenant-1',
        purchaseOrderId: 'po-1',
        purchaseReceiptId: 'receipt-1',
        warehouseId: 'wh-1',
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'audit.log',
      expect.objectContaining({
        module: 'procurement',
        action: 'purchase.receipt.created',
      }),
    );
  });
});
