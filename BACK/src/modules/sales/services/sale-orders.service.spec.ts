import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
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
    status: 'ACTIVE',
    kind: 'RESALE',
    isPurchasable: true,
    isSellable: true,
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
    customer: {
      id: 'cust-1',
      firstName: 'María',
      lastName: 'González',
      email: null,
    },
    items: [],
    invoice: null,
    guarantors: [],
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
    findLastQuoteNumber: jest.Mock;
  };
  let productsRepository: { findManyByIds: jest.Mock };
  let guarantorsRepository: { findBySaleOrder: jest.Mock; create: jest.Mock };
  let creditEvaluationService: {
    getCustomerCreditHistory: jest.Mock;
    evaluateIncomeCapacity: jest.Mock;
    getBureauCheckStatus: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let prisma: {
    $transaction: jest.Mock;
    saleOrder: { update: jest.Mock; updateMany: jest.Mock };
    user: { findUnique: jest.Mock };
    branch: { findFirst: jest.Mock };
    creditPlan: { findFirst: jest.Mock };
    installment: { count: jest.Mock };
    customer: { findFirst: jest.Mock };
    loan: { findMany: jest.Mock };
    deliveryNote: { upsert: jest.Mock };
  };

  let tx: any;
  let outbox: { enqueue: jest.Mock; dispatch: jest.Mock };

  beforeEach(() => {
    saleOrdersRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findPendingApprovals: jest.fn(),
      findLastQuoteNumber: jest.fn().mockResolvedValue(null),
    };
    productsRepository = { findManyByIds: jest.fn() };
    guarantorsRepository = {
      findBySaleOrder: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'guarantor-1' }),
    };
    creditEvaluationService = {
      getCustomerCreditHistory: jest.fn().mockResolvedValue({
        rating: 'SIN_HISTORIAL',
        activeLoans: [],
        overdueCount: 0,
        overdueAmount: 0,
      }),
      evaluateIncomeCapacity: jest.fn().mockResolvedValue({
        applicable: false,
        monthlyIncome: null,
        maxIncomePercentage: null,
        maxAllowed: null,
        currentCommitment: 0,
        proposedMonthlyPayment: 0,
        available: null,
        exceeds: false,
      }),
      getBureauCheckStatus: jest
        .fn()
        .mockResolvedValue({ required: false, latestResult: null }),
    };
    eventEmitter = { emit: jest.fn() };
    outbox = {
      enqueue: jest.fn().mockResolvedValue('event-1'),
      dispatch: jest.fn().mockResolvedValue(true),
    };

    tx = {
      saleOrder: {
        create: jest.fn().mockResolvedValue({ id: 'order-1' }),
        findUnique: jest.fn().mockResolvedValue(makeOrder()),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue(makeOrder({ status: 'DELIVERED' })),
        update: jest.fn().mockResolvedValue(makeOrder({ status: 'CANCELLED' })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      saleOrderItem: {
        create: jest.fn().mockResolvedValue(makeOrderItem()),
        update: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      productUnit: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      stockMovement: {
        create: jest.fn(),
        // Por defecto: stock de sobra y ninguna reserva previa. Los tests de
        // stock sobreescriben esto.
        groupBy: jest
          .fn()
          .mockImplementation(
            ({
              by,
              where,
            }: {
              by: string[];
              where: { productId?: { in: string[] } };
            }) =>
              Promise.resolve(
                by[0] === 'productId'
                  ? (where.productId?.in ?? []).map((productId) => ({
                      productId,
                      _sum: { quantity: 1000 },
                    }))
                  : [],
              ),
          ),
      },
      posSession: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'session-1', status: 'OPEN' }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cust-walkin' }),
        create: jest.fn().mockResolvedValue({ id: 'cust-walkin' }),
      },
      salePayment: { createMany: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
      saleOrder: {
        update: jest.fn().mockResolvedValue(makeOrder({ status: 'CANCELLED' })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      branch: { findFirst: jest.fn().mockResolvedValue(null) },
      creditPlan: {
        findFirst: jest.fn().mockResolvedValue({ interestRate: 20 }),
      },
      installment: { count: jest.fn().mockResolvedValue(0) },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ creditLimit: null }),
      },
      loan: { findMany: jest.fn().mockResolvedValue([]) },
      deliveryNote: {
        upsert: jest.fn().mockResolvedValue({ id: 'dn-1', status: 'PENDING' }),
      },
    };

    service = new SaleOrdersService(
      prisma as any,
      saleOrdersRepository as any,
      productsRepository,
      guarantorsRepository as any,
      creditEvaluationService as any,
      eventEmitter as any,
      // Implementación real sobre el tx simulado: las aserciones sobre
      // tx.stockMovement/tx.productUnit siguen valiendo.
      new StockLedgerService(),
      outbox as any,
    );
    // approveCredit y collectPayment transicionan dentro de la transacción:
    // mismo mock para no duplicar los setups existentes.
    tx.saleOrder.updateMany = prisma.saleOrder.updateMany;
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('readScope', () => {
    it('lets sales:read see every order', () => {
      expect(service.readScope(['sales:read', 'sales:quotes:read'])).toBe(
        'ALL',
      );
    });

    it('limits sales:quotes:read to quotes', () => {
      expect(service.readScope(['sales:quotes:read'])).toBe('QUOTES');
    });

    it('rejects users without either permission', () => {
      expect(() => service.readScope(['billing:read'])).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findOneForReader', () => {
    it('hides non-quote orders from quote-only readers', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ orderType: 'STANDARD' }),
      );
      await expect(
        service.findOneForReader('tenant-1', 'order-1', 'QUOTES'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns quotes to quote-only readers', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ orderType: 'QUOTE' }),
      );
      await expect(
        service.findOneForReader('tenant-1', 'order-1', 'QUOTES'),
      ).resolves.toMatchObject({ orderType: 'QUOTE' });
    });

    it('filters the list to quotes for quote-only readers', async () => {
      saleOrdersRepository.findAll.mockResolvedValue([]);
      await service.findAll('tenant-1', 'user-1', 'QUOTES');
      expect(saleOrdersRepository.findAll).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'QUOTE',
      );
    });
  });

  describe('findAll', () => {
    it('delegates to repository without seller filter for managers', async () => {
      saleOrdersRepository.findAll.mockResolvedValue([makeOrder()]);
      await service.findAll('tenant-1');
      expect(saleOrdersRepository.findAll).toHaveBeenCalledWith(
        'tenant-1',
        undefined,
        undefined,
      );
    });

    it('passes sellerId filter for non-managers', async () => {
      saleOrdersRepository.findAll.mockResolvedValue([makeOrder()]);
      await service.findAll('tenant-1', 'user-42');
      expect(saleOrdersRepository.findAll).toHaveBeenCalledWith(
        'tenant-1',
        'user-42',
        undefined,
      );
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
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      customerId: 'cust-1',
      items: [{ productId: 'prod-1', quantity: 2, unitPrice: 2_500_000 }],
    };

    it('creates a PENDING order with non-serialized product', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);

      const result = await service.create(
        'tenant-1',
        baseDto,
        undefined,
        false,
        ['sales:create'],
      );

      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('throws NotFoundException when product does not exist', async () => {
      productsRepository.findManyByIds.mockResolvedValue([]);

      await expect(
        service.create('tenant-1', baseDto, undefined, false, ['sales:create']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each(['DRAFT', 'INACTIVE', 'BLOCKED'])(
      'refuses to sell a product in %s',
      async (status) => {
        productsRepository.findManyByIds.mockResolvedValue([
          makeProduct({ status }),
        ]);

        await expect(
          service.create('tenant-1', baseDto, undefined, false, [
            'sales:create',
          ]),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);

        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('names the product and its state so the seller knows what to fix', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ status: 'DRAFT' }),
      ]);

      await expect(
        service.create('tenant-1', baseDto, undefined, false, ['sales:create']),
      ).rejects.toThrow(/Heladera Samsung \(borrador\)/);
    });

    it('refuses to sell a raw material — la madera entra por compra y sale por producción', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ name: 'Tablero MDF 18mm', isSellable: false }),
      ]);

      await expect(
        service.create('tenant-1', baseDto, undefined, false, ['sales:create']),
      ).rejects.toThrow(/no se vende, es de uso interno: Tablero MDF 18mm/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sells a raw material that was explicitly marked as sellable', async () => {
      // El tornillo que es materia prima de un mueble y además se vende
      // suelto en el mostrador — por eso el flag es editable, no derivado.
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ kind: 'RAW_MATERIAL', isSellable: true }),
      ]);

      await service.create('tenant-1', baseDto, undefined, false, [
        'sales:create',
      ]);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when serialized product has wrong serial count', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: true }),
      ]);

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

      await expect(
        service.create('tenant-1', dto, undefined, false, ['sales:create']),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('persists financedUnitPrice on each item for a credit sale', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);
      prisma.creditPlan.findFirst.mockResolvedValue({ interestRate: 20 });

      await service.create(
        'tenant-1',
        {
          customerId: 'cust-1',
          saleType: 'CREDIT',
          installments: 10,
          items: [{ productId: 'prod-1', quantity: 2, unitPrice: 2_500_000 }],
        },
        undefined,
        false,
        ['sales:create'],
      );

      expect(tx.saleOrderItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ financedUnitPrice: 2_500_000 * 1.2 }),
        }),
      );
    });

    it('omits financedUnitPrice for a cash sale', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);

      await service.create('tenant-1', baseDto, undefined, false, [
        'sales:create',
      ]);

      expect(tx.saleOrderItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ financedUnitPrice: undefined }),
        }),
      );
    });

    it("uses the current user's branch when assigned", async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);
      prisma.user.findUnique.mockResolvedValue({ branchId: 'branch-user' });

      await service.create('tenant-1', baseDto, 'user-1', false, [
        'sales:create',
      ]);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { branchId: true },
      });
      expect(prisma.branch.findFirst).not.toHaveBeenCalled();
      expect(tx.saleOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 'branch-user' }),
        }),
      );
    });

    it("falls back to the tenant's main branch when the user has none assigned", async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);
      prisma.user.findUnique.mockResolvedValue({ branchId: null });
      prisma.branch.findFirst.mockResolvedValue({ id: 'branch-main' });

      await service.create('tenant-1', baseDto, 'user-1', false, [
        'sales:create',
      ]);

      expect(prisma.branch.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', isMain: true },
        select: { id: true },
      });
      expect(tx.saleOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 'branch-main' }),
        }),
      );
    });

    it('sets branchId to null when there is no user and no main branch configured', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);

      await service.create('tenant-1', baseDto, undefined, false, [
        'sales:create',
      ]);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(tx.saleOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: null }),
        }),
      );
    });

    it('throws ForbiddenException when creating a STANDARD order without sales:create', async () => {
      await expect(
        service.create('tenant-1', baseDto, undefined, false, [
          'sales:quotes:manage',
        ]),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when creating a QUOTE without sales:quotes:manage', async () => {
      await expect(
        service.create(
          'tenant-1',
          { ...baseDto, orderType: 'QUOTE' },
          undefined,
          false,
          ['sales:create'],
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('generates a PRES-AA-NNNNNN quoteNumber and emits sale.order.quoted for a QUOTE', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);
      saleOrdersRepository.findLastQuoteNumber.mockResolvedValue(null);

      const result = await service.create(
        'tenant-1',
        { ...baseDto, orderType: 'QUOTE' },
        'user-1',
        false,
        ['sales:quotes:manage'],
      );

      const year = String(new Date().getFullYear()).slice(-2);
      expect(tx.saleOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quoteNumber: `PRES-${year}-000001` }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'sale.order.quoted',
        expect.objectContaining({
          tenantId: 'tenant-1',
          issuedById: 'user-1',
        }),
      );
      expect(result).toBeDefined();
    });
  });

  // ── createPosSale ────────────────────────────────────────────────────────────

  describe('createPosSale', () => {
    const baseDto = {
      items: [{ productId: 'prod-1', quantity: 2, unitPrice: 2_500_000 }],
      payments: [{ amount: 5_000_000, paymentMethod: 'CASH' as const }],
    };

    it('creates a DELIVERED order in one transaction and emits sale.payment.collected', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);

      const result = await service.createPosSale(
        'tenant-1',
        baseDto,
        'session-1',
        'user-1',
      );

      expect(result.status).toBe('DELIVERED');
      expect(tx.saleOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: 'POS',
            saleType: 'CASH',
            posSessionId: 'session-1',
          }),
        }),
      );
      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'OUT' }),
        }),
      );
      expect(tx.salePayment.createMany).toHaveBeenCalled();
      expect(outbox.enqueue).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        'sale.payment.collected',
        expect.objectContaining({ tenantId: 'tenant-1' }),
      );
      expect(outbox.dispatch).toHaveBeenCalledWith('event-1');
      expect(result).not.toHaveProperty('eventId');
    });

    it('rejects the sale when there is not enough stock', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);
      tx.stockMovement.groupBy.mockResolvedValue([
        { productId: 'prod-1', _sum: { quantity: 1 } },
      ]);

      await expect(
        service.createPosSale('tenant-1', baseDto, 'session-1', 'user-1'),
      ).rejects.toThrow('Heladera Samsung (disponible 1, pedido 2)');
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('rejects when the POS session is not OPEN (closed mid-request)', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);
      tx.posSession.findFirst.mockResolvedValue(null);

      await expect(
        service.createPosSale('tenant-1', baseDto, 'session-1', 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(tx.saleOrder.create).not.toHaveBeenCalled();
    });

    it('resolves a walk-in "Consumidor Final" customer when customerId is omitted', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);
      tx.customer.findFirst.mockResolvedValue(null); // no walk-in customer yet for this tenant

      await service.createPosSale('tenant-1', baseDto, 'session-1', 'user-1');

      expect(tx.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: 'Consumidor',
            lastName: 'Final',
          }),
        }),
      );
      expect(tx.saleOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ customerId: 'cust-walkin' }),
        }),
      );
    });

    it('throws UnprocessableEntityException when a serialized product has the wrong serial count', async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: true }),
      ]);

      const dto = {
        items: [
          {
            productId: 'prod-1',
            quantity: 2,
            unitPrice: 2_500_000,
            serialNumbers: ['SN001'],
          },
        ],
        payments: [{ amount: 5_000_000, paymentMethod: 'CASH' as const }],
      };

      await expect(
        service.createPosSale('tenant-1', dto, 'session-1', 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it("resolves branchId from the cashier's user before opening the transaction", async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);
      prisma.user.findUnique.mockResolvedValue({ branchId: 'branch-cashier' });

      await service.createPosSale('tenant-1', baseDto, 'session-1', 'user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { branchId: true },
      });
      expect(tx.saleOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 'branch-cashier' }),
        }),
      );
    });

    it("falls back to the tenant's main branch when the cashier has no branch assigned", async () => {
      productsRepository.findManyByIds.mockResolvedValue([
        makeProduct({ isSerialized: false }),
      ]);
      prisma.user.findUnique.mockResolvedValue({ branchId: null });
      prisma.branch.findFirst.mockResolvedValue({ id: 'branch-main' });

      await service.createPosSale('tenant-1', baseDto, 'session-1', 'user-1');

      expect(tx.saleOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 'branch-main' }),
        }),
      );
    });
  });

  // ── confirm ────────────────────────────────────────────────────────────────

  describe('confirm', () => {
    it('throws UnprocessableEntityException when order is not in a confirmable status', async () => {
      tx.saleOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.confirm('tenant-1', 'order-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('confirms a PENDING order and emits event', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'CONFIRMED', items: [makeOrderItem()] }),
      );

      await service.confirm('tenant-1', 'order-1');

      expect(tx.saleOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1' }),
          data: { status: 'CONFIRMED' },
        }),
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        'sale.order.completed',
        { tenantId: 'tenant-1', saleOrderId: 'order-1' },
      );
      expect(outbox.dispatch).toHaveBeenCalledWith('event-1');
    });

    it('reserves stock for a credit order that has no reservation yet', async () => {
      tx.saleOrderItem.findMany.mockResolvedValue([
        {
          ...makeOrderItem(),
          warehouseId: null,
          product: { name: 'Heladera', isSerialized: false },
        },
      ]);
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'CONFIRMED' }),
      );

      await service.confirm('tenant-1', 'order-1');

      expect(tx.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'RESERVED',
          quantity: -2,
          referenceId: 'item-1',
        }),
      });
    });

    it('does not reserve again items that already have a reservation (cash orders)', async () => {
      tx.saleOrderItem.findMany.mockResolvedValue([
        {
          ...makeOrderItem(),
          warehouseId: null,
          product: { name: 'Heladera', isSerialized: false },
        },
      ]);
      tx.stockMovement.groupBy.mockImplementation(({ by }: { by: string[] }) =>
        Promise.resolve(
          by[0] === 'referenceId'
            ? [{ referenceId: 'item-1', _sum: { quantity: -2 } }]
            : [],
        ),
      );
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'CONFIRMED' }),
      );

      await service.confirm('tenant-1', 'order-1');

      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('rejects the confirmation when there is not enough stock to reserve', async () => {
      tx.saleOrderItem.findMany.mockResolvedValue([
        {
          ...makeOrderItem({ quantity: 5 }),
          warehouseId: null,
          product: { name: 'Heladera', isSerialized: false },
        },
      ]);
      tx.stockMovement.groupBy.mockImplementation(({ by }: { by: string[] }) =>
        Promise.resolve(
          by[0] === 'productId'
            ? [{ productId: 'prod-1', _sum: { quantity: 3 } }]
            : [],
        ),
      );

      await expect(service.confirm('tenant-1', 'order-1')).rejects.toThrow(
        'No hay stock suficiente de: Heladera (disponible 3, pedido 5)',
      );
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('throws UnprocessableEntityException when order is CONFIRMED', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'CONFIRMED' }),
      );

      await expect(
        service.cancel('tenant-1', 'order-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('cancels a PENDING order and releases its active reservation', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'PENDING', items: [makeOrderItem()] }),
      );
      tx.stockMovement.groupBy.mockResolvedValue([
        { referenceId: 'item-1', _sum: { quantity: -2 } },
      ]);

      const result = await service.cancel('tenant-1', 'order-1');

      expect(tx.saleOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } }),
      );
      expect(tx.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'RESERVED',
          quantity: 2,
          referenceId: 'item-1',
        }),
      });
      expect(result).toBeDefined();
    });

    it('does not create a release when nothing is reserved', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'PENDING', items: [makeOrderItem()] }),
      );
      tx.stockMovement.groupBy.mockResolvedValue([]);

      await service.cancel('tenant-1', 'order-1');

      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  // ── deliver ────────────────────────────────────────────────────────────────

  describe('deliver', () => {
    it('releases the reservation and creates the OUT movement', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'DELIVERED',
          saleType: 'CREDIT',
          items: [makeOrderItem()],
        }),
      );
      tx.stockMovement.groupBy.mockResolvedValue([
        { referenceId: 'item-1', _sum: { quantity: -2 } },
      ]);

      await service.deliver('tenant-1', 'order-1');

      const types = tx.stockMovement.create.mock.calls.map(
        (c: [{ data: { type: string; quantity: number } }]) => [
          c[0].data.type,
          c[0].data.quantity,
        ],
      );
      expect(types).toEqual([
        ['RESERVED', 2],
        ['OUT', -2],
      ]);
    });
  });

  // ── approveCredit ─────────────────────────────────────────────────────────

  describe('approveCredit', () => {
    it('throws UnprocessableEntityException when order is not pending approval', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'CONFIRMED' }),
      );

      await expect(
        service.approveCredit('tenant-1', 'order-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('approves a PENDING_CREDIT_APPROVAL order', async () => {
      prisma.saleOrder.updateMany.mockResolvedValue({ count: 1 });
      saleOrdersRepository.findById
        .mockResolvedValueOnce(makeOrder({ status: 'PENDING_CREDIT_APPROVAL' }))
        .mockResolvedValue(makeOrder({ status: 'CREDIT_APPROVED' }));

      const result = await service.approveCredit(
        'tenant-1',
        'order-1',
        'user-1',
      );

      expect(prisma.saleOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING_CREDIT_APPROVAL' }),
          data: expect.objectContaining({ status: 'CREDIT_APPROVED' }),
        }),
      );
      expect(result?.status).toBe('CREDIT_APPROVED');
    });

    it('blocks approval when the customer has overdue installments', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'PENDING_CREDIT_APPROVAL',
          items: [{ unitPrice: 100_000, quantity: 1 }],
        }),
      );
      prisma.installment.count.mockResolvedValue(2);

      await expect(
        service.approveCredit('tenant-1', 'order-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.saleOrder.updateMany).not.toHaveBeenCalled();
    });

    it('blocks approval when outstanding debt plus the new order exceeds the credit limit', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'PENDING_CREDIT_APPROVAL',
          items: [{ unitPrice: 600_000, quantity: 1 }],
        }),
      );
      prisma.customer.findFirst.mockResolvedValue({ creditLimit: 1_000_000 });
      prisma.loan.findMany.mockResolvedValue([
        { totalAmount: 500_000, installments: [{ paidAmount: 0 }] }, // saldo pendiente 500_000
      ]);

      // deuda activa 500_000 + pedido 600_000 = 1_100_000 > límite 1_000_000
      await expect(
        service.approveCredit('tenant-1', 'order-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('allows approval when an active loan is almost fully paid — counts outstanding balance, not the original amount (regression)', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'PENDING_CREDIT_APPROVAL',
          items: [{ unitPrice: 600_000, quantity: 1 }],
        }),
      );
      prisma.customer.findFirst.mockResolvedValue({ creditLimit: 1_000_000 });
      // préstamo original de 900_000, pero ya pagó 850_000 -> saldo pendiente 50_000
      prisma.loan.findMany.mockResolvedValue([
        { totalAmount: 900_000, installments: [{ paidAmount: 850_000 }] },
      ]);

      // con el bug viejo: 900_000 + 600_000 = 1_500_000 > 1_000_000 -> bloqueaba mal
      // arreglado: 50_000 (saldo) + 600_000 = 650_000 <= 1_000_000 -> aprueba
      const result = await service.approveCredit(
        'tenant-1',
        'order-1',
        'user-1',
      );

      expect(prisma.saleOrder.updateMany).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('blocks approval when the proposed installment exceeds income capacity', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'PENDING_CREDIT_APPROVAL',
          items: [{ unitPrice: 900_000, quantity: 1 }],
        }),
      );
      creditEvaluationService.evaluateIncomeCapacity.mockResolvedValue({
        applicable: true,
        monthlyIncome: 3_000_000,
        maxIncomePercentage: 30,
        maxAllowed: 900_000,
        currentCommitment: 500_000,
        proposedMonthlyPayment: 900_000,
        available: 400_000,
        exceeds: true,
      });

      await expect(
        service.approveCredit('tenant-1', 'order-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.saleOrder.updateMany).not.toHaveBeenCalled();
    });

    it('passes the declared income of every guarantor on the order to the capacity check', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'PENDING_CREDIT_APPROVAL',
          items: [{ unitPrice: 900_000, quantity: 1 }],
          guarantors: [
            { monthlyIncome: 1_000_000 },
            { monthlyIncome: null },
            { monthlyIncome: 500_000 },
          ],
        }),
      );

      await service.approveCredit('tenant-1', 'order-1');

      expect(
        creditEvaluationService.evaluateIncomeCapacity,
      ).toHaveBeenCalledWith(
        'tenant-1',
        'cust-1',
        expect.any(Number),
        [1_000_000, 0, 500_000],
      );
    });

    it('allows approval when income capacity does not apply (no salary/config data)', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'PENDING_CREDIT_APPROVAL',
          items: [{ unitPrice: 900_000, quantity: 1 }],
        }),
      );

      const result = await service.approveCredit(
        'tenant-1',
        'order-1',
        'user-1',
      );

      expect(prisma.saleOrder.updateMany).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('blocks approval when a bureau check is required but not yet registered', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'PENDING_CREDIT_APPROVAL',
          items: [{ unitPrice: 100_000, quantity: 1 }],
        }),
      );
      creditEvaluationService.getBureauCheckStatus.mockResolvedValue({
        required: true,
        latestResult: null,
      });

      await expect(
        service.approveCredit('tenant-1', 'order-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.saleOrder.updateMany).not.toHaveBeenCalled();
    });

    it('blocks approval when the latest bureau check is flagged', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'PENDING_CREDIT_APPROVAL',
          items: [{ unitPrice: 100_000, quantity: 1 }],
        }),
      );
      creditEvaluationService.getBureauCheckStatus.mockResolvedValue({
        required: false,
        latestResult: 'FLAGGED',
      });

      await expect(
        service.approveCredit('tenant-1', 'order-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.saleOrder.updateMany).not.toHaveBeenCalled();
    });

    it('allows approval when the latest bureau check is clean', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'PENDING_CREDIT_APPROVAL',
          items: [{ unitPrice: 100_000, quantity: 1 }],
        }),
      );
      creditEvaluationService.getBureauCheckStatus.mockResolvedValue({
        required: false,
        latestResult: 'CLEAN',
      });

      const result = await service.approveCredit(
        'tenant-1',
        'order-1',
        'user-1',
      );

      expect(prisma.saleOrder.updateMany).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  // ── requestAdjustment ────────────────────────────────────────────────────

  describe('requestAdjustment', () => {
    it('transitions a pending-approval order to CREDIT_NEEDS_ADJUSTMENT', async () => {
      prisma.saleOrder.updateMany.mockResolvedValue({ count: 1 });
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'CREDIT_NEEDS_ADJUSTMENT' }),
      );

      const result = await service.requestAdjustment(
        'tenant-1',
        'order-1',
        { suggestedAlternatives: ['ADD_GUARANTOR'], note: 'Falta garante' },
        'user-1',
      );

      expect(prisma.saleOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING_CREDIT_APPROVAL' }),
          data: expect.objectContaining({
            status: 'CREDIT_NEEDS_ADJUSTMENT',
            suggestedAlternatives: ['ADD_GUARANTOR'],
            adjustmentNote: 'Falta garante',
          }),
        }),
      );
      expect(result?.status).toBe('CREDIT_NEEDS_ADJUSTMENT');
    });

    it('throws UnprocessableEntityException when order is not pending approval', async () => {
      prisma.saleOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.requestAdjustment('tenant-1', 'order-1', {
          suggestedAlternatives: ['MORE_INSTALLMENTS'],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  // ── addGuarantor ─────────────────────────────────────────────────────────

  describe('addGuarantor', () => {
    it('creates a guarantor and leaves the order in CREDIT_NEEDS_ADJUSTMENT', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'CREDIT_NEEDS_ADJUSTMENT' }),
      );

      const dto = {
        firstName: 'Juan',
        lastName: 'Pérez',
        documentType: 'CI' as never,
        documentNumber: '1234567',
      };
      const result = await service.addGuarantor(
        'tenant-1',
        'order-1',
        dto,
        'user-1',
      );

      expect(guarantorsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          saleOrderId: 'order-1',
          firstName: 'Juan',
        }),
      );
      expect(prisma.saleOrder.update).not.toHaveBeenCalled();
      expect(prisma.saleOrder.updateMany).not.toHaveBeenCalled();
      expect(result?.status).toBe('CREDIT_NEEDS_ADJUSTMENT');
    });

    it('throws UnprocessableEntityException when order does not need adjustments', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'PENDING_CREDIT_APPROVAL' }),
      );

      await expect(
        service.addGuarantor('tenant-1', 'order-1', {
          firstName: 'Juan',
          lastName: 'Pérez',
          documentType: 'CI',
          documentNumber: '1234567',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(guarantorsRepository.create).not.toHaveBeenCalled();
    });
  });

  // ── adjustOrder ──────────────────────────────────────────────────────────

  describe('adjustOrder', () => {
    it('throws when the order does not need adjustments', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'PENDING_CREDIT_APPROVAL' }),
      );

      await expect(
        service.adjustOrder('tenant-1', 'order-1', { installments: 6 }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws when there is nothing to change', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'CREDIT_NEEDS_ADJUSTMENT' }),
      );

      await expect(
        service.adjustOrder('tenant-1', 'order-1', {}),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('replaces items, recalculates financedUnitPrice and totals, and keeps the status unchanged', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'CREDIT_NEEDS_ADJUSTMENT',
          saleType: 'CREDIT',
          installments: 3,
          interestRate: 15,
          surchargeType: null,
          surchargeAmount: null,
          items: [makeOrderItem({ id: 'old-item-1' })],
        }),
      );
      productsRepository.findManyByIds.mockResolvedValue([makeProduct()]);
      prisma.creditPlan.findFirst.mockResolvedValue({
        installments: 6,
        interestRate: 25,
        isActive: true,
      });

      await service.adjustOrder(
        'tenant-1',
        'order-1',
        {
          installments: 6,
          items: [{ productId: 'prod-1', quantity: 1, unitPrice: 2_500_000 }],
        },
        'user-1',
      );

      expect(tx.productUnit.updateMany).toHaveBeenCalledWith({
        where: { saleOrderItemId: { in: ['old-item-1'] } },
        data: { saleOrderItemId: null },
      });
      expect(tx.saleOrderItem.deleteMany).toHaveBeenCalledWith({
        where: { saleOrderId: 'order-1' },
      });
      expect(tx.saleOrderItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            saleOrderId: 'order-1',
            productId: 'prod-1',
            financedUnitPrice: 2_500_000 * 1.25,
          }),
        }),
      );
      expect(tx.saleOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: {
          installments: 6,
          interestRate: 25,
          subtotal: 2_500_000,
          total: 2_500_000,
        },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({ action: 'sale.order.adjusted' }),
      );
    });

    it('recalculates financedUnitPrice on existing items when only installments change', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({
          status: 'CREDIT_NEEDS_ADJUSTMENT',
          saleType: 'CREDIT',
          installments: 3,
          interestRate: 15,
          surchargeType: null,
          surchargeAmount: null,
          items: [
            makeOrderItem({ id: 'item-1', quantity: 1, unitPrice: 2_000_000 }),
          ],
        }),
      );
      prisma.creditPlan.findFirst.mockResolvedValue({
        installments: 6,
        interestRate: 25,
        isActive: true,
      });

      await service.adjustOrder(
        'tenant-1',
        'order-1',
        { installments: 6 },
        'user-1',
      );

      expect(tx.saleOrderItem.deleteMany).not.toHaveBeenCalled();
      expect(tx.saleOrderItem.create).not.toHaveBeenCalled();
      expect(tx.saleOrderItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { financedUnitPrice: 2_000_000 * 1.25 },
      });
    });
  });

  // ── resubmitForApproval ──────────────────────────────────────────────────

  describe('resubmitForApproval', () => {
    it('moves the order back to PENDING_CREDIT_APPROVAL', async () => {
      saleOrdersRepository.findById.mockResolvedValue(
        makeOrder({ status: 'PENDING_CREDIT_APPROVAL' }),
      );

      await service.resubmitForApproval('tenant-1', 'order-1', 'user-1');

      expect(prisma.saleOrder.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'order-1',
          tenantId: 'tenant-1',
          status: 'CREDIT_NEEDS_ADJUSTMENT',
        },
        data: { status: 'PENDING_CREDIT_APPROVAL' },
      });
    });

    it('throws when the order is not in CREDIT_NEEDS_ADJUSTMENT', async () => {
      prisma.saleOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.resubmitForApproval('tenant-1', 'order-1', 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  // ── rejectCredit ─────────────────────────────────────────────────────────

  describe('rejectCredit', () => {
    it('throws UnprocessableEntityException when order is not pending approval', async () => {
      prisma.saleOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.rejectCredit(
          'tenant-1',
          'order-1',
          'motivo insuficiente fondos',
        ),
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
