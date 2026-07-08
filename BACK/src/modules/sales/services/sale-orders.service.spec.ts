import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SaleOrdersService } from './sale-orders.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduct(overrides = {}) {
  return {
    id: 'prod-1',
    tenantId: 'tenant-1',
    name: 'Heladera Samsung',
    isSerialized: false,
    unit: 'unidad',
    costPrice: 2_000_000,
    salePrice: 2_500_000,
    deletedAt: null,
    ...overrides,
  };
}

function makeOrder(overrides = {}) {
  return {
    id: 'order-1',
    tenantId: 'tenant-1',
    customerId: 'cust-1',
    status: 'PENDING',
    orderDate: new Date(),
    notes: null,
    customer: { id: 'cust-1', firstName: 'María', lastName: 'González', email: null },
    items: [],
    invoice: null,
    ...overrides,
  };
}

function makeOrderItem(overrides = {}) {
  return {
    id: 'item-1',
    saleOrderId: 'order-1',
    productId: 'prod-1',
    quantity: 2,
    unitPrice: 2_500_000,
    productUnits: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SaleOrdersService', () => {
  let service: SaleOrdersService;
  let saleOrdersRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findPendingApprovals: jest.Mock;
  };
  let productsRepository: { findManyByIds: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let prisma: {
    $transaction: jest.Mock;
    saleOrder: { update: jest.Mock; updateMany: jest.Mock };
  };

  beforeEach(() => {
    saleOrdersRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findPendingApprovals: jest.fn(),
    };
    productsRepository = { findManyByIds: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    const tx = {
      saleOrder: {
        create: jest.fn().mockResolvedValue({ id: 'order-1' }),
        findUnique: jest.fn().mockResolvedValue(makeOrder()),
        update: jest.fn().mockResolvedValue(makeOrder({ status: 'CANCELLED' })),
      },
      saleOrderItem: { create: jest.fn().mockResolvedValue(makeOrderItem()) },
      productUnit: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      stockMovement: { create: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
      saleOrder: {
        update: jest.fn().mockResolvedValue(makeOrder({ status: 'CANCELLED' })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    service = new SaleOrdersService(
      prisma as any,
      saleOrdersRepository as any,
      productsRepository as any,
      eventEmitter as any,
    );
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository without seller filter for managers', () => {
      saleOrdersRepository.findAll.mockResolvedValue([makeOrder()]);
      service.findAll('tenant-1');
      expect(saleOrdersRepository.findAll).toHaveBeenCalledWith('tenant-1', undefined);
    });

    it('passes sellerId filter for non-managers', () => {
      saleOrdersRepository.findAll.mockResolvedValue([makeOrder()]);
      service.findAll('tenant-1', 'user-42');
      expect(saleOrdersRepository.findAll).toHaveBeenCalledWith('tenant-1', 'user-42');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the order when found', async () => {
      saleOrdersRepository.findById.mockResolvedValue(makeOrder());
      const result = await service.findOne('tenant-1', 'order-1');
      expect(result.id).toBe('order-1');
    });

    it('throws NotFoundException when order does not exist', async () => {
      saleOrdersRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      customerId: 'cust-1',
      items: [{ productId: 'prod-1', quantity: 2, unitPrice: 2_500_000 }],
    };

    it('creates a PENDING order with non-serialized product', async () => {
      productsRepository.findManyByIds.mockResolvedValue([makeProduct({ isSerialized: false })]);

      const result = await service.create('tenant-1', baseDto);

      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('throws NotFoundException when product does not exist', async () => {
      productsRepository.findManyByIds.mockResolvedValue([]);

      await expect(service.create('tenant-1', baseDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws UnprocessableEntityException when serialized product has wrong serial count', async () => {
      productsRepository.findManyByIds.mockResolvedValue([makeProduct({ isSerialized: true })]);

      const dto = {
        customerId: 'cust-1',
        items: [
          {
            productId: 'prod-1',
            quantity: 2,
            unitPrice: 2_500_000,
            serialNumbers: ['SN001'], // 1 provided, 2 required
          },
        ],
      };

      await expect(service.create('tenant-1', dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  // ── confirm ────────────────────────────────────────────────────────────────

  describe('confirm', () => {
    it('throws UnprocessableEntityException when order is not in a confirmable status', async () => {
      prisma.saleOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.confirm('tenant-1', 'order-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('confirms a PENDING order with non-serialized products and emits event', async () => {
      const order = makeOrder({
        status: 'PENDING',
        items: [makeOrderItem()],
      });
      saleOrdersRepository.findById
        .mockResolvedValueOnce(order)                                // findOne inside confirm
        .mockResolvedValueOnce(makeOrder({ status: 'CONFIRMED' })); // final fetch

      productsRepository.findManyByIds.mockResolvedValue([makeProduct({ isSerialized: false })]);

      await service.confirm('tenant-1', 'order-1');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'sale.order.completed',
        expect.objectContaining({ tenantId: 'tenant-1', saleOrderId: 'order-1' }),
      );
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('throws UnprocessableEntityException when order is CONFIRMED', async () => {
      saleOrdersRepository.findById.mockResolvedValue(makeOrder({ status: 'CONFIRMED' }));

      await expect(service.cancel('tenant-1', 'order-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('cancels a PENDING order', async () => {
      saleOrdersRepository.findById.mockResolvedValue(makeOrder({ status: 'PENDING' }));

      const result = await service.cancel('tenant-1', 'order-1');

      expect(prisma.saleOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } }),
      );
      expect(result).toBeDefined();
    });
  });

  // ── approveCredit ─────────────────────────────────────────────────────────

  describe('approveCredit', () => {
    it('throws UnprocessableEntityException when order is not pending approval', async () => {
      prisma.saleOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approveCredit('tenant-1', 'order-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('approves a PENDING_CREDIT_APPROVAL order', async () => {
      prisma.saleOrder.updateMany.mockResolvedValue({ count: 1 });
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'CREDIT_APPROVED' }),
      );

      const result = await service.approveCredit('tenant-1', 'order-1', 'user-1');

      expect(prisma.saleOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING_CREDIT_APPROVAL' }),
          data: expect.objectContaining({ status: 'CREDIT_APPROVED' }),
        }),
      );
      expect(result?.status).toBe('CREDIT_APPROVED');
    });
  });

  // ── rejectCredit ─────────────────────────────────────────────────────────

  describe('rejectCredit', () => {
    it('throws UnprocessableEntityException when order is not pending approval', async () => {
      prisma.saleOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.rejectCredit('tenant-1', 'order-1', 'motivo insuficiente fondos'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects a PENDING_CREDIT_APPROVAL order', async () => {
      prisma.saleOrder.updateMany.mockResolvedValue({ count: 1 });
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'CREDIT_REJECTED' }),
      );

      const result = await service.rejectCredit(
        'tenant-1',
        'order-1',
        'Saldo insuficiente',
        'user-1',
      );

      expect(prisma.saleOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING_CREDIT_APPROVAL' }),
          data: expect.objectContaining({ status: 'CREDIT_REJECTED' }),
        }),
      );
      expect(result?.status).toBe('CREDIT_REJECTED');
    });
  });
});
