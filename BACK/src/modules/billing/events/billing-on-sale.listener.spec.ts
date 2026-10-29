import { BillingSourcesRepository } from '../repositories/billing-sources.repository';
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
    product: { name: 'Heladera', ivaTaxRate: 10 },
    ...overrides,
  };
}

describe('BillingOnSaleListener', () => {
  let prisma: {
    loan: { findFirst: jest.Mock };
    saleOrder: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let invoicesRepository: {
    findBySaleOrder: jest.Mock;
    create: jest.Mock;
    createItem: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let listener: BillingOnSaleListener;

  beforeEach(() => {
    prisma = {
      loan: { findFirst: jest.fn().mockResolvedValue(null) },
      saleOrder: { findFirst: jest.fn().mockResolvedValue(null) },
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
      new BillingSourcesRepository(prisma as any),
    );
  });

  it('is idempotent — does nothing if an invoice already exists for the order', async () => {
    invoicesRepository.findBySaleOrder.mockResolvedValue({
      id: 'existing-invoice',
    });

    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CASH',
      items: [],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.create).not.toHaveBeenCalled();
  });

  it('sums item cash prices for a CASH sale', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CASH',
      items: [makeItem({ quantity: 2, unitPrice: 500_000 })],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: 1_000_000 }),
      expect.anything(),
    );
    expect(invoicesRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ unitPrice: 500_000, total: 1_000_000 }),
      expect.anything(),
    );
  });

  it('breaks down the IVA included in each item by the product rate', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CASH',
      items: [
        makeItem({ quantity: 1, unitPrice: 110_000 }),
        makeItem({
          quantity: 2,
          unitPrice: 52_500,
          product: { name: 'Arroz', ivaTaxRate: 5 },
        }),
        makeItem({
          quantity: 1,
          unitPrice: 30_000,
          product: { name: 'Libro', ivaTaxRate: 0 },
        }),
        makeItem({
          quantity: 1,
          unitPrice: 22_000,
          product: null,
          description: 'Flete',
        }),
      ],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    const items = invoicesRepository.createItem.mock.calls.map((c) => c[0]);
    expect(items).toEqual([
      expect.objectContaining({
        description: 'Heladera',
        ivaRate: 10,
        ivaAmount: 10_000,
        unitPriceWithoutIva: 100_000,
      }),
      expect.objectContaining({
        description: 'Arroz',
        total: 105_000,
        ivaRate: 5,
        ivaAmount: 5_000,
        unitPriceWithoutIva: 50_000,
      }),
      expect.objectContaining({
        description: 'Libro',
        ivaRate: 0,
        ivaAmount: 0,
        unitPriceWithoutIva: 30_000,
      }),
      expect.objectContaining({
        description: 'Flete',
        ivaRate: 10,
        ivaAmount: 2_000,
      }),
    ]);
  });

  it('uses Loan.totalAmount as the invoice total for a CREDIT sale', async () => {
    prisma.loan.findFirst.mockResolvedValue({ totalAmount: 1_200_000 });

    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CREDIT',
      items: [
        makeItem({
          quantity: 2,
          unitPrice: 500_000,
          financedUnitPrice: 600_000,
        }),
      ],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: 1_200_000 }),
      expect.anything(),
    );
  });

  it('uses financedUnitPrice (not the cash unitPrice) for CREDIT sale invoice items', async () => {
    prisma.loan.findFirst.mockResolvedValue({ totalAmount: 1_200_000 });

    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CREDIT',
      items: [
        makeItem({
          quantity: 2,
          unitPrice: 500_000,
          financedUnitPrice: 600_000,
        }),
      ],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ unitPrice: 600_000, total: 1_200_000 }),
      expect.anything(),
    );
  });

  it('falls back to the cash unitPrice for CREDIT sale items with no financedUnitPrice (legacy items)', async () => {
    prisma.loan.findFirst.mockResolvedValue({ totalAmount: 1_000_000 });

    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CREDIT',
      items: [
        makeItem({
          quantity: 2,
          unitPrice: 500_000,
          financedUnitPrice: null,
        }),
      ],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ unitPrice: 500_000, total: 1_000_000 }),
      expect.anything(),
    );
  });

  it('falls back to summing effective item prices when saleType is CREDIT but no Loan exists yet', async () => {
    prisma.loan.findFirst.mockResolvedValue(null);

    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CREDIT',
      items: [
        makeItem({
          quantity: 2,
          unitPrice: 500_000,
          financedUnitPrice: 600_000,
        }),
      ],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: 1_200_000 }),
      expect.anything(),
    );
  });

  it('emits audit.log after creating the invoice', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CASH',
      items: [makeItem()],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

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
