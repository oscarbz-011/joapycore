import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduct(overrides = {}) {
  return {
    id: 'prod-1',
    tenantId: 'tenant-1',
    name: 'Heladera Samsung',
    isSerialized: false,
    ...overrides,
  };
}

function makeOrder(overrides = {}) {
  return {
    id: 'po-1',
    tenantId: 'tenant-1',
    supplierId: 'sup-1',
    status: 'PENDING' as const,
    purchaseType: 'LOCAL' as const,
    orderDate: new Date(),
    items: [],
    ...overrides,
  };
}

function makeOrderItem(overrides = {}) {
  return {
    id: 'item-1',
    purchaseOrderId: 'po-1',
    productId: 'prod-1',
    quantity: 5,
    unitCost: 2_000_000,
    receivedQty: 0,
    purchaseOrder: { tenantId: 'tenant-1' },
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let purchaseOrdersRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    createItem: jest.Mock;
    updateStatus: jest.Mock;
    findItem: jest.Mock;
    updateItemReceivedQty: jest.Mock;
  };
  let productsRepository: { findById: jest.Mock };
  let productUnitsRepository: { createMany: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let prisma: { $transaction: jest.Mock };

  beforeEach(() => {
    purchaseOrdersRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn().mockResolvedValue(makeOrder()),
      createItem: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      findItem: jest.fn(),
      updateItemReceivedQty: jest.fn(),
    };
    productsRepository = { findById: jest.fn() };
    productUnitsRepository = { createMany: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    const tx = {
      saleOrder: {},
      stockMovement: { create: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };

    service = new PurchaseOrdersService(
      prisma as any,
      purchaseOrdersRepository as any,
      productsRepository as any,
      productUnitsRepository as any,
      eventEmitter as any,
    );
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository', () => {
      purchaseOrdersRepository.findAll.mockResolvedValue([makeOrder()]);
      service.findAll('tenant-1');
      expect(purchaseOrdersRepository.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns order when found', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(makeOrder());
      const result = await service.findOne('tenant-1', 'po-1');
      expect(result.id).toBe('po-1');
    });

    it('throws NotFoundException when order does not exist', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      supplierId: 'sup-1',
      purchaseType: 'LOCAL' as const,
      orderDate: '2026-06-21',
      items: [{ productId: 'prod-1', quantity: 5, unitCost: 2_000_000 }],
    };

    it('creates a PENDING order through a transaction', async () => {
      const result = await service.create('tenant-1', 'user-1', dto);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  // ── confirm ────────────────────────────────────────────────────────────────

  describe('confirm', () => {
    it('throws UnprocessableEntityException when order is not PENDING', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(makeOrder({ status: 'CONFIRMED' }));

      await expect(service.confirm('tenant-1', 'po-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(purchaseOrdersRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('confirms a PENDING order', async () => {
      purchaseOrdersRepository.findById
        .mockResolvedValueOnce(makeOrder({ status: 'PENDING' }))
        .mockResolvedValueOnce(makeOrder({ status: 'CONFIRMED' }));

      await service.confirm('tenant-1', 'po-1');

      expect(purchaseOrdersRepository.updateStatus).toHaveBeenCalledWith(
        'tenant-1',
        'po-1',
        'CONFIRMED',
      );
    });
  });

  // ── receive ────────────────────────────────────────────────────────────────

  describe('receive', () => {
    it('throws UnprocessableEntityException when order is PENDING', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(makeOrder({ status: 'PENDING' }));

      await expect(
        service.receive('tenant-1', 'po-1', { items: [{ itemId: 'item-1' }] }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws NotFoundException when item does not belong to tenant', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(makeOrder({ status: 'CONFIRMED' }));
      purchaseOrdersRepository.findItem.mockResolvedValue({
        ...makeOrderItem(),
        purchaseOrder: { tenantId: 'other-tenant' },
      });

      await expect(
        service.receive('tenant-1', 'po-1', { items: [{ itemId: 'item-1' }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('receives a non-serialized item and emits event', async () => {
      const order = makeOrder({
        status: 'CONFIRMED',
        items: [makeOrderItem({ quantity: 5, receivedQty: 0 })],
      });
      purchaseOrdersRepository.findById
        .mockResolvedValueOnce(order)      // findOne
        .mockResolvedValueOnce({ ...order, items: [makeOrderItem({ receivedQty: 5 })] }) // post-update
        .mockResolvedValueOnce({ ...order, status: 'RECEIVED' }); // final fetch

      purchaseOrdersRepository.findItem.mockResolvedValue(makeOrderItem());
      productsRepository.findById.mockResolvedValue(makeProduct({ isSerialized: false }));

      await service.receive('tenant-1', 'po-1', { items: [{ itemId: 'item-1' }] });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'purchase.order.received',
        expect.objectContaining({ tenantId: 'tenant-1', purchaseOrderId: 'po-1' }),
      );
    });

    it('throws UnprocessableEntityException when serialized item has no serial numbers', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(makeOrder({ status: 'CONFIRMED' }));
      purchaseOrdersRepository.findItem.mockResolvedValue(makeOrderItem());
      productsRepository.findById.mockResolvedValue(makeProduct({ isSerialized: true }));

      await expect(
        service.receive('tenant-1', 'po-1', { items: [{ itemId: 'item-1', serialNumbers: [] }] }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });
});
