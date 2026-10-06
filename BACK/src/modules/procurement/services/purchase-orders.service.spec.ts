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
    findLastOrderNumber: jest.Mock;
    findCatalogItems: jest.Mock;
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
      findProductStatuses: jest.fn().mockResolvedValue([
        {
          id: 'prod-1',
          name: 'Heladera Samsung',
          status: 'ACTIVE',
          isPurchasable: true,
        },
      ]),
      findLastOrderNumber: jest.fn().mockResolvedValue(null),
      findCatalogItems: jest.fn().mockResolvedValue([]),
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
          {
            id: 'prod-1',
            name: 'Heladera Samsung',
            status,
            isPurchasable: true,
          },
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

  describe('order number', () => {
    const dto = {
      supplierId: 'sup-1',
      purchaseType: 'LOCAL' as const,
      orderDate: '2026-10-06',
      items: [{ productId: 'prod-1', quantity: 2, unitCost: 100 }],
    };
    const year = String(new Date().getFullYear()).slice(-2);

    it('numbers the first order of the tenant', async () => {
      await service.create('tenant-1', 'user-1', dto);

      expect(purchaseOrdersRepository.findLastOrderNumber).toHaveBeenCalledWith(
        'tenant-1',
        expect.anything(),
      );
      expect(purchaseOrdersRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ orderNumber: `OC-${year}-000001` }),
        expect.anything(),
      );
    });

    it('continues the sequence of the tenant', async () => {
      purchaseOrdersRepository.findLastOrderNumber.mockResolvedValue({
        orderNumber: 'OC-25-000041',
      });

      await service.create('tenant-1', 'user-1', dto);

      expect(purchaseOrdersRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ orderNumber: `OC-${year}-000042` }),
        expect.anything(),
      );
    });
  });

  describe('order number collisions', () => {
    const dto = {
      supplierId: 'sup-1',
      purchaseType: 'LOCAL' as const,
      orderDate: '2026-10-06',
      items: [{ productId: 'prod-1', quantity: 2, unitCost: 100 }],
    };
    const duplicated = Object.assign(new Error('unique'), { code: 'P2002' });

    it('tries again with the next number when another order took it', async () => {
      purchaseOrdersRepository.create
        .mockRejectedValueOnce(duplicated)
        .mockResolvedValueOnce(makeOrder());
      purchaseOrdersRepository.findLastOrderNumber
        .mockResolvedValueOnce({ orderNumber: 'OC-26-000007' })
        .mockResolvedValueOnce({ orderNumber: 'OC-26-000008' });

      await service.create('tenant-1', 'user-1', dto);

      expect(purchaseOrdersRepository.create).toHaveBeenCalledTimes(2);
      expect(purchaseOrdersRepository.create).toHaveBeenLastCalledWith(
        'tenant-1',
        expect.objectContaining({
          orderNumber: expect.stringMatching(/^OC-\d{2}-000009$/),
        }),
        expect.anything(),
      );
    });

    it('gives up after a few attempts instead of looping', async () => {
      purchaseOrdersRepository.create.mockRejectedValue(duplicated);

      await expect(service.create('tenant-1', 'user-1', dto)).rejects.toBe(
        duplicated,
      );
      expect(purchaseOrdersRepository.create).toHaveBeenCalledTimes(3);
    });

    it('does not retry other failures', async () => {
      const failure = new Error('database down');
      purchaseOrdersRepository.create.mockRejectedValue(failure);

      await expect(service.create('tenant-1', 'user-1', dto)).rejects.toBe(
        failure,
      );
      expect(purchaseOrdersRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('items taken from the supplier catalog', () => {
    const dto = {
      supplierId: 'sup-1',
      purchaseType: 'LOCAL' as const,
      orderDate: '2026-10-06',
      items: [
        {
          productId: 'prod-1',
          quantity: 2,
          unitCost: 100,
          catalogItemId: 'cat-1',
        },
      ],
    };

    it('keeps the supplier code and description on the order line', async () => {
      purchaseOrdersRepository.findCatalogItems.mockResolvedValue([
        {
          id: 'cat-1',
          productId: 'prod-1',
          supplierSku: '332726',
          description: 'ABRIDOR DE VINHO',
        },
      ]);

      await service.create('tenant-1', 'user-1', dto);

      expect(purchaseOrdersRepository.findCatalogItems).toHaveBeenCalledWith(
        'tenant-1',
        'sup-1',
        ['cat-1'],
      );
      expect(purchaseOrdersRepository.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          catalogItemId: 'cat-1',
          supplierSku: '332726',
          supplierDescription: 'ABRIDOR DE VINHO',
        }),
        expect.anything(),
      );
    });

    // El repositorio filtra por tenant y proveedor: un ítem de otro proveedor
    // o de otra empresa no vuelve, y la orden no se crea.
    it('rejects a catalog item of another supplier or tenant', async () => {
      purchaseOrdersRepository.findCatalogItems.mockResolvedValue([]);

      await expect(
        service.create('tenant-1', 'user-1', dto),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(purchaseOrdersRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a catalog item linked to a different product', async () => {
      purchaseOrdersRepository.findCatalogItems.mockResolvedValue([
        {
          id: 'cat-1',
          productId: 'other-product',
          supplierSku: '332726',
          description: 'ABRIDOR DE VINHO',
        },
      ]);

      await expect(
        service.create('tenant-1', 'user-1', dto),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(purchaseOrdersRepository.create).not.toHaveBeenCalled();
    });

    it('leaves a loose product without supplier code', async () => {
      await service.create('tenant-1', 'user-1', {
        ...dto,
        items: [{ productId: 'prod-1', quantity: 1, unitCost: 100 }],
      });

      expect(purchaseOrdersRepository.findCatalogItems).not.toHaveBeenCalled();
      expect(purchaseOrdersRepository.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          catalogItemId: null,
          supplierSku: null,
          supplierDescription: null,
        }),
        expect.anything(),
      );
    });
  });

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
