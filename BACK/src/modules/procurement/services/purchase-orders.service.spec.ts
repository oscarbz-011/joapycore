import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

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
    findProductStatuses: jest.Mock;
  };
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
      // Por defecto, ficha completa: los tests que no van sobre el estado del
      // producto no tienen que saber que esta validación existe.
      findProductStatuses: jest
        .fn()
        .mockResolvedValue([
          { id: 'prod-1', name: 'Heladera Samsung', status: 'ACTIVE', isPurchasable: true },
        ]),
    };
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
      eventEmitter as any,
    );
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository', async () => {
      purchaseOrdersRepository.findAll.mockResolvedValue([makeOrder()]);
      await service.findAll('tenant-1');
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
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
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

    it.each(['DRAFT', 'INACTIVE', 'BLOCKED'])(
      'refuses to buy a product in %s',
      async (status) => {
        purchaseOrdersRepository.findProductStatuses.mockResolvedValue([
          { id: 'prod-1', name: 'Heladera Samsung', status, isPurchasable: true },
        ]);

        await expect(
          service.create('tenant-1', 'user-1', dto),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);

        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('names the product and its state in the error', async () => {
      purchaseOrdersRepository.findProductStatuses.mockResolvedValue([
        {
          id: 'prod-1',
          name: 'Heladera Samsung',
          status: 'DRAFT',
          isPurchasable: true,
        },
      ]);

      await expect(service.create('tenant-1', 'user-1', dto)).rejects.toThrow(
        /Heladera Samsung \(borrador\)/,
      );
    });

    it('refuses to buy a manufactured product — el mueble sale de producción, no de un proveedor', async () => {
      purchaseOrdersRepository.findProductStatuses.mockResolvedValue([
        {
          id: 'prod-1',
          name: 'Mesa de comedor 6 sillas',
          status: 'ACTIVE',
          isPurchasable: false,
        },
      ]);

      await expect(service.create('tenant-1', 'user-1', dto)).rejects.toThrow(
        /no se compra a proveedores, se fabrica: Mesa de comedor 6 sillas/,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('buys a raw material — la materia prima sí entra por compra', async () => {
      purchaseOrdersRepository.findProductStatuses.mockResolvedValue([
        {
          id: 'prod-1',
          name: 'Tablero MDF 18mm',
          status: 'ACTIVE',
          isPurchasable: true,
        },
      ]);

      await service.create('tenant-1', 'user-1', dto);

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  // ── confirm ────────────────────────────────────────────────────────────────

  describe('confirm', () => {
    it('throws UnprocessableEntityException when order is not PENDING', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'CONFIRMED' }),
      );

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
});
