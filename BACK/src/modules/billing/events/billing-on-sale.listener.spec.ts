import { BillingOnSaleListener } from './billing-on-sale.listener';

const TENANT = 'tenant-1';
const ORDER_ID = 'order-1';

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    productId: 'prod-1',
    quantity: 2,
    unitPrice: 500_000,
    financedUnitPrice: null,
    product: { name: 'Heladera' },
    ...overrides,
  };
}

describe('BillingOnSaleListener', () => {
  let prisma: { loan: { findUnique: jest.Mock }; $transaction: jest.Mock };
  let invoicesRepository: {
    findBySaleOrder: jest.Mock;
    create: jest.Mock;
    createItem: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let listener: BillingOnSaleListener;

  beforeEach(() => {
    prisma = {
      loan: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => unknown) => cb({})),
    };
    invoicesRepository = {
      findBySaleOrder: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'invoice-1' }),
      createItem: jest.fn().mockResolvedValue({}),
    };
    eventEmitter = { emit: jest.fn() };

    listener = new BillingOnSaleListener(
      prisma as any,
      invoicesRepository as any,
      eventEmitter as any,
    );
  });

  it('is idempotent — does nothing if an invoice already exists for the order', async () => {
    invoicesRepository.findBySaleOrder.mockResolvedValue({
      id: 'existing-invoice',
    });

    await listener.handle({
      tenantId: TENANT,
      saleOrderId: ORDER_ID,
      order: { saleType: 'CASH', items: [] },
    });

    expect(invoicesRepository.create).not.toHaveBeenCalled();
  });

  it('sums item cash prices for a CASH sale', async () => {
    await listener.handle({
      tenantId: TENANT,
      saleOrderId: ORDER_ID,
      order: {
        saleType: 'CASH',
        items: [makeItem({ quantity: 2, unitPrice: 500_000 })],
      },
    });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: 1_000_000 }),
      expect.anything(),
    );
    expect(invoicesRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ unitPrice: 500_000, total: 1_000_000 }),
      expect.anything(),
    );
  });

  it('uses Loan.totalAmount as the invoice total for a CREDIT sale', async () => {
    prisma.loan.findUnique.mockResolvedValue({ totalAmount: 1_200_000 });

    await listener.handle({
      tenantId: TENANT,
      saleOrderId: ORDER_ID,
      order: {
        saleType: 'CREDIT',
        items: [
          makeItem({
            quantity: 2,
            unitPrice: 500_000,
            financedUnitPrice: 600_000,
          }),
        ],
      },
    });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: 1_200_000 }),
      expect.anything(),
    );
  });

  it('uses financedUnitPrice (not the cash unitPrice) for CREDIT sale invoice items', async () => {
    prisma.loan.findUnique.mockResolvedValue({ totalAmount: 1_200_000 });

    await listener.handle({
      tenantId: TENANT,
      saleOrderId: ORDER_ID,
      order: {
        saleType: 'CREDIT',
        items: [
          makeItem({
            quantity: 2,
            unitPrice: 500_000,
            financedUnitPrice: 600_000,
          }),
        ],
      },
    });

    expect(invoicesRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ unitPrice: 600_000, total: 1_200_000 }),
      expect.anything(),
    );
  });

  it('falls back to the cash unitPrice for CREDIT sale items with no financedUnitPrice (legacy items)', async () => {
    prisma.loan.findUnique.mockResolvedValue({ totalAmount: 1_000_000 });

    await listener.handle({
      tenantId: TENANT,
      saleOrderId: ORDER_ID,
      order: {
        saleType: 'CREDIT',
        items: [
          makeItem({
            quantity: 2,
            unitPrice: 500_000,
            financedUnitPrice: null,
          }),
        ],
      },
    });

    expect(invoicesRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ unitPrice: 500_000, total: 1_000_000 }),
      expect.anything(),
    );
  });

  it('falls back to summing effective item prices when saleType is CREDIT but no Loan exists yet', async () => {
    prisma.loan.findUnique.mockResolvedValue(null);

    await listener.handle({
      tenantId: TENANT,
      saleOrderId: ORDER_ID,
      order: {
        saleType: 'CREDIT',
        items: [
          makeItem({
            quantity: 2,
            unitPrice: 500_000,
            financedUnitPrice: 600_000,
          }),
        ],
      },
    });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: 1_200_000 }),
      expect.anything(),
    );
  });

  it('emits audit.log after creating the invoice', async () => {
    await listener.handle({
      tenantId: TENANT,
      saleOrderId: ORDER_ID,
      order: { saleType: 'CASH', items: [makeItem()] },
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'audit.log',
      expect.objectContaining({
        tenantId: TENANT,
        module: 'billing',
        action: 'invoice.created',
      }),
    );
  });
});
