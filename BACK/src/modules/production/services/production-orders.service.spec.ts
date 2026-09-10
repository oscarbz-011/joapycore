import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ProductionOrdersService } from './production-orders.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduct(overrides = {}) {
  return {
    id: 'mesa-1',
    name: 'Mesa de comedor',
    kind: 'MANUFACTURED' as const,
    status: 'ACTIVE' as const,
    unit: 'unidad',
    isSerialized: false,
    ...overrides,
  };
}

function makeOrder(overrides = {}) {
  return {
    id: 'po-1',
    tenantId: 'tenant-1',
    orderNumber: 1,
    productId: 'mesa-1',
    quantity: 2,
    status: 'DRAFT' as const,
    warehouseId: 'wh-1',
    items: [
      {
        id: 'item-1',
        componentId: 'tablero-1',
        plannedQuantity: 6,
        usedQuantity: 0,
        component: { id: 'tablero-1', name: 'Tablero MDF', unit: 'unidad' },
      },
    ],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProductionOrdersService', () => {
  let service: ProductionOrdersService;
  let repository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    nextOrderNumber: jest.Mock;
    create: jest.Mock;
    createItems: jest.Mock;
    updateStatus: jest.Mock;
    updateItemUsedQuantity: jest.Mock;
    findRecipe: jest.Mock;
    findProduct: jest.Mock;
    getStock: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock; emitAsync: jest.Mock };
  let prisma: { $transaction: jest.Mock };

  beforeEach(() => {
    repository = {
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(makeOrder()),
      nextOrderNumber: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue({ id: 'po-1' }),
      createItems: jest.fn(),
      updateStatus: jest.fn(),
      updateItemUsedQuantity: jest.fn(),
      findRecipe: jest.fn().mockResolvedValue([
        {
          componentId: 'tablero-1',
          quantity: 3,
          component: { id: 'tablero-1', name: 'Tablero MDF', unit: 'unidad' },
        },
      ]),
      findProduct: jest.fn().mockResolvedValue(makeProduct()),
      // Stock de sobra por defecto.
      getStock: jest.fn().mockResolvedValue(new Map([['tablero-1', 100]])),
    };
    eventEmitter = { emit: jest.fn(), emitAsync: jest.fn().mockResolvedValue([]) };
    const tx = {};
    prisma = { $transaction: jest.fn().mockImplementation((cb) => cb(tx)) };

    service = new ProductionOrdersService(
      prisma as any,
      repository as any,
      eventEmitter as any,
    );
  });

  const dto = { productId: 'mesa-1', quantity: 2 };

  // ── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('explodes the recipe: 2 mesas × 3 tableros = 6', async () => {
      await service.create('tenant-1', 'user-1', dto);

      expect(repository.createItems).toHaveBeenCalledWith(
        [
          {
            productionOrderId: 'po-1',
            componentId: 'tablero-1',
            plannedQuantity: 6,
          },
        ],
        {},
      );
    });

    it.each(['RESALE', 'RAW_MATERIAL'])(
      'refuses to produce a %s product',
      async (kind) => {
        repository.findProduct.mockResolvedValue(makeProduct({ kind }));

        await expect(
          service.create('tenant-1', 'user-1', dto),
        ).rejects.toThrow(/Solo se puede producir un producto fabricado/);
      },
    );

    it('refuses a product without a recipe — sería un alta de stock disfrazada', async () => {
      repository.findRecipe.mockResolvedValue([]);

      await expect(service.create('tenant-1', 'user-1', dto)).rejects.toThrow(
        /no tiene receta cargada/,
      );
    });

    it('refuses a serialized product: no hay de dónde sacar los N/S', async () => {
      repository.findProduct.mockResolvedValue(
        makeProduct({ isSerialized: true }),
      );

      await expect(service.create('tenant-1', 'user-1', dto)).rejects.toThrow(
        /serializado/,
      );
    });

    it('refuses a product that is not ACTIVE', async () => {
      repository.findProduct.mockResolvedValue(makeProduct({ status: 'DRAFT' }));

      await expect(
        service.create('tenant-1', 'user-1', dto),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws NotFoundException when the product does not exist', async () => {
      repository.findProduct.mockResolvedValue(null);

      await expect(
        service.create('tenant-1', 'user-1', dto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── start ───────────────────────────────────────────────────────────────

  describe('start', () => {
    it('moves a DRAFT order to IN_PROGRESS', async () => {
      await service.start('tenant-1', 'po-1', 'user-1');

      expect(repository.updateStatus).toHaveBeenCalledWith(
        'tenant-1',
        'po-1',
        expect.objectContaining({ status: 'IN_PROGRESS' }),
      );
    });

    it('refuses to start without enough raw material, naming what is missing', async () => {
      repository.getStock.mockResolvedValue(new Map([['tablero-1', 2]]));

      await expect(service.start('tenant-1', 'po-1')).rejects.toThrow(
        /Tablero MDF \(necesita 6, hay 2\)/,
      );

      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('refuses to start an order that is not DRAFT', async () => {
      repository.findById.mockResolvedValue(
        makeOrder({ status: 'IN_PROGRESS' }),
      );

      await expect(
        service.start('tenant-1', 'po-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  // ── complete ────────────────────────────────────────────────────────────

  describe('complete', () => {
    beforeEach(() => {
      repository.findById.mockResolvedValue(makeOrder({ status: 'IN_PROGRESS' }));
    });

    it('consumes the planned quantity when no real consumption is sent', async () => {
      await service.complete('tenant-1', 'po-1', {}, 'user-1');

      expect(repository.updateItemUsedQuantity).toHaveBeenCalledWith(
        'item-1',
        6,
        {},
      );
    });

    it('records the real consumption when it differs from the plan', async () => {
      await service.complete(
        'tenant-1',
        'po-1',
        { consumptions: [{ componentId: 'tablero-1', usedQuantity: 7 }] },
        'user-1',
      );

      expect(repository.updateItemUsedQuantity).toHaveBeenCalledWith(
        'item-1',
        7,
        {},
      );
    });

    it('emits production.order.completed so inventory moves the stock', async () => {
      await service.complete('tenant-1', 'po-1', {}, 'user-1');

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        'production.order.completed',
        expect.objectContaining({
          tenantId: 'tenant-1',
          productionOrderId: 'po-1',
          productId: 'mesa-1',
          quantity: 2,
          warehouseId: 'wh-1',
          consumed: [{ productId: 'tablero-1', quantity: 6 }],
        }),
      );
    });

    it('re-checks stock at completion — pudo consumirse en otra orden mientras tanto', async () => {
      repository.getStock.mockResolvedValue(new Map([['tablero-1', 1]]));

      await expect(
        service.complete('tenant-1', 'po-1', {}, 'user-1'),
      ).rejects.toThrow(/No hay stock suficiente/);

      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
    });

    it('refuses to complete an order that is not IN_PROGRESS', async () => {
      repository.findById.mockResolvedValue(makeOrder({ status: 'DRAFT' }));

      await expect(
        service.complete('tenant-1', 'po-1', {}, 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  // ── cancel ──────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels a DRAFT order', async () => {
      await service.cancel('tenant-1', 'po-1', 'user-1');

      expect(repository.updateStatus).toHaveBeenCalledWith(
        'tenant-1',
        'po-1',
        { status: 'CANCELLED' },
      );
    });

    it('refuses to cancel a COMPLETED order — ya movió stock', async () => {
      repository.findById.mockResolvedValue(makeOrder({ status: 'COMPLETED' }));

      await expect(service.cancel('tenant-1', 'po-1')).rejects.toThrow(
        /ya movió stock/,
      );
    });
  });
});
