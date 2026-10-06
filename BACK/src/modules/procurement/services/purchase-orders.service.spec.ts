import {
  ConflictException,
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
    advanceAmount: 0,
    advancePayments: [] as { kind: string; amount: number }[],
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
    transition: jest.Mock;
    recordStatusChange: jest.Mock;
    advanceApplied: jest.Mock;
    findSupplierAdvancePercent: jest.Mock;
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
      transition: jest.fn().mockResolvedValue({ count: 1 }),
      recordStatusChange: jest.fn(),
      advanceApplied: jest.fn().mockResolvedValue(0),
      findSupplierAdvancePercent: jest
        .fn()
        .mockResolvedValue({ advancePercent: null }),
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

    it('reports where the advance of the order stands', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          advanceAmount: 500_000,
          advancePayments: [{ kind: 'ADVANCE', amount: 300_000 }],
        }),
      );
      purchaseOrdersRepository.advanceApplied.mockResolvedValue(100_000);

      const result = await service.findOne('tenant-1', 'po-1');

      expect(purchaseOrdersRepository.advanceApplied).toHaveBeenCalledWith(
        'tenant-1',
        'po-1',
      );
      expect(result.advance).toEqual({
        required: 500_000,
        paid: 300_000,
        refunded: 0,
        applied: 100_000,
        available: 200_000,
        pending: 200_000,
      });
    });
  });

  // ── anticipo ───────────────────────────────────────────────────────────────

  describe('advance asked by the order', () => {
    // Total: 5 × 2.000.000 = 10.000.000
    const dto = {
      supplierId: 'sup-1',
      purchaseType: 'LOCAL' as const,
      orderDate: '2026-10-07',
      items: [{ productId: 'prod-1', quantity: 5, unitCost: 2_000_000 }],
    };
    const createdWith = () =>
      purchaseOrdersRepository.create.mock.calls[0][1] as {
        advanceAmount: number;
      };

    it('asks for none when the supplier does not require it', async () => {
      await service.create('tenant-1', 'user-1', dto);

      expect(createdWith().advanceAmount).toBe(0);
    });

    it('starts from the percentage the supplier usually asks for', async () => {
      purchaseOrdersRepository.findSupplierAdvancePercent.mockResolvedValue({
        advancePercent: '30.00',
      });

      await service.create('tenant-1', 'user-1', dto);

      expect(
        purchaseOrdersRepository.findSupplierAdvancePercent,
      ).toHaveBeenCalledWith('tenant-1', 'sup-1');
      expect(createdWith().advanceAmount).toBe(3_000_000);
    });

    it('lets the order set its own amount, even none', async () => {
      purchaseOrdersRepository.findSupplierAdvancePercent.mockResolvedValue({
        advancePercent: '30.00',
      });

      await service.create('tenant-1', 'user-1', {
        ...dto,
        advanceAmount: 0,
      });

      expect(createdWith().advanceAmount).toBe(0);
    });

    it('accepts the whole order up front but not more', async () => {
      await service.create('tenant-1', 'user-1', {
        ...dto,
        advanceAmount: 10_000_000,
      });
      expect(createdWith().advanceAmount).toBe(10_000_000);

      await expect(
        service.create('tenant-1', 'user-1', {
          ...dto,
          advanceAmount: 10_000_001,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(purchaseOrdersRepository.create).toHaveBeenCalledTimes(1);
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

    it.each(['INACTIVE', 'BLOCKED'])(
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
          status: 'INACTIVE',
          isPurchasable: true,
        },
      ]);

      await expect(service.create('tenant-1', 'user-1', dto)).rejects.toThrow(
        /Heladera Samsung \(descontinuado\)/,
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

  describe('products not yet complete', () => {
    const dto = {
      supplierId: 'sup-1',
      purchaseType: 'LOCAL' as const,
      orderDate: '2026-10-06',
      items: [{ productId: 'prod-1', quantity: 2, unitCost: 100 }],
    };
    const withStatus = (status: string) =>
      purchaseOrdersRepository.findProductStatuses.mockResolvedValue([
        { id: 'prod-1', name: 'Abridor', status, isPurchasable: true },
      ]);

    // Al decidir una compra desde la comparación de catálogos el producto se
    // puede crear incompleto: se termina de cargar antes de recibirlo.
    it('orders a draft product', async () => {
      withStatus('DRAFT');

      await service.create('tenant-1', 'user-1', dto);

      expect(purchaseOrdersRepository.create).toHaveBeenCalled();
    });

    it.each(['INACTIVE', 'BLOCKED'])(
      'still refuses a product that is %s',
      async (status) => {
        withStatus(status);

        await expect(
          service.create('tenant-1', 'user-1', dto),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(purchaseOrdersRepository.create).not.toHaveBeenCalled();
      },
    );
  });

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

  describe('status changes', () => {
    const order = (status: string, items: unknown[] = []) =>
      makeOrder({ status, items });

    it('records the creation as the first entry of the history', async () => {
      await service.create('tenant-1', 'user-1', {
        supplierId: 'sup-1',
        purchaseType: 'LOCAL' as const,
        orderDate: '2026-10-06',
        items: [{ productId: 'prod-1', quantity: 1, unitCost: 100 }],
      });

      expect(purchaseOrdersRepository.recordStatusChange).toHaveBeenCalledWith(
        {
          tenantId: 'tenant-1',
          purchaseOrderId: 'po-1',
          fromStatus: null,
          toStatus: 'PENDING',
          changedById: 'user-1',
        },
        expect.anything(),
      );
    });

    it('sends a draft to the supplier', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(order('PENDING'));

      await service.send('tenant-1', 'po-1', 'user-1');

      expect(purchaseOrdersRepository.transition).toHaveBeenCalledWith(
        'tenant-1',
        'po-1',
        ['PENDING'],
        'SENT',
        expect.anything(),
      );
      expect(purchaseOrdersRepository.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          purchaseOrderId: 'po-1',
          fromStatus: 'PENDING',
          toStatus: 'SENT',
          changedById: 'user-1',
        }),
        expect.anything(),
      );
    });

    it('asks for the PDF of the order it just sent', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(order('PENDING'));

      await service.send('tenant-1', 'po-1', 'user-1');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'purchase.order.pdf.requested',
        {
          tenantId: 'tenant-1',
          purchaseOrderId: 'po-1',
          requestedById: 'user-1',
        },
      );
    });

    it('does not send an order twice', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(order('SENT'));

      await expect(
        service.send('tenant-1', 'po-1', 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(purchaseOrdersRepository.transition).not.toHaveBeenCalled();
    });

    it.each(['PENDING', 'SENT'])(
      'confirms an order in %s — the supplier may confirm by phone before it is sent',
      async (status) => {
        purchaseOrdersRepository.findById.mockResolvedValue(order(status));

        await service.confirm('tenant-1', 'po-1', 'user-1');

        expect(purchaseOrdersRepository.transition).toHaveBeenCalledWith(
          'tenant-1',
          'po-1',
          ['PENDING', 'SENT'],
          'CONFIRMED',
          expect.anything(),
        );
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'purchase.order.confirmed',
          { tenantId: 'tenant-1', purchaseOrderId: 'po-1' },
        );
      },
    );

    it('does not confirm an order already confirmed', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(order('CONFIRMED'));

      await expect(service.confirm('tenant-1', 'po-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(purchaseOrdersRepository.transition).not.toHaveBeenCalled();
    });

    it('cancels with a reason that stays in the history', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(order('CONFIRMED'));

      await service.cancel('tenant-1', 'po-1', '  Sin stock  ', 'user-1');

      expect(purchaseOrdersRepository.transition).toHaveBeenCalledWith(
        'tenant-1',
        'po-1',
        ['PENDING', 'SENT', 'CONFIRMED'],
        'CANCELLED',
        expect.anything(),
      );
      expect(purchaseOrdersRepository.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fromStatus: 'CONFIRMED',
          toStatus: 'CANCELLED',
          reason: 'Sin stock',
        }),
        expect.anything(),
      );
    });

    // Plata adelantada al proveedor: primero se registra que la devolvió.
    it('does not cancel while the supplier still holds an advance', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'SENT',
          advancePayments: [{ kind: 'ADVANCE', amount: 300_000 }],
        }),
      );

      await expect(
        service.cancel('tenant-1', 'po-1', 'Sin stock', 'user-1'),
      ).rejects.toThrow(/devolución/);
      expect(purchaseOrdersRepository.transition).not.toHaveBeenCalled();
    });

    it('cancels once the advance was refunded', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'SENT',
          advancePayments: [
            { kind: 'ADVANCE', amount: 300_000 },
            { kind: 'ADVANCE_REFUND', amount: 300_000 },
          ],
        }),
      );

      await service.cancel('tenant-1', 'po-1', 'Sin stock', 'user-1');

      expect(purchaseOrdersRepository.transition).toHaveBeenCalled();
    });

    // Con mercadería recibida ya hay stock y una cuenta por pagar: cancelar
    // la orden los dejaría sin respaldo.
    it.each(['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'])(
      'does not cancel an order in %s',
      async (status) => {
        purchaseOrdersRepository.findById.mockResolvedValue(order(status));

        await expect(
          service.cancel('tenant-1', 'po-1', 'Motivo', 'user-1'),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(purchaseOrdersRepository.transition).not.toHaveBeenCalled();
      },
    );

    it('reports a conflict when the order changed in the meantime', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(order('PENDING'));
      purchaseOrdersRepository.transition.mockResolvedValue({ count: 0 });

      await expect(
        service.send('tenant-1', 'po-1', 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        purchaseOrdersRepository.recordStatusChange,
      ).not.toHaveBeenCalled();
    });

    it('does not touch an order of another tenant', async () => {
      purchaseOrdersRepository.findById.mockResolvedValue(null);

      await expect(
        service.cancel('tenant-2', 'po-1', 'Motivo', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(purchaseOrdersRepository.transition).not.toHaveBeenCalled();
    });
  });
});
