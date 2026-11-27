import { Prisma } from '@prisma/client';
import { BillingSourcesRepository } from '../repositories/billing-sources.repository';
import { BillingOnSaleListener } from './billing-on-sale.listener';

const TENANT = 'tenant-1';
const ORDER_ID = 'order-1';

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    productId: 'prod-1',
    quantity: 2,
    unitPrice: new Prisma.Decimal(500000),
    financedUnitPrice: null,
    product: { name: 'Heladera', ivaTaxRate: new Prisma.Decimal(10) },
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
      salePayments: [],
      items: [],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.create).not.toHaveBeenCalled();
  });

  it('sums item cash prices for a CASH sale', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CASH',
      salePayments: [],
      items: [makeItem({ quantity: 2, unitPrice: new Prisma.Decimal(500000) })],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: new Prisma.Decimal(1000000) }),
      expect.anything(),
    );
    expect(invoicesRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        unitPrice: new Prisma.Decimal(500000),
        total: new Prisma.Decimal(1000000),
      }),
      expect.anything(),
    );
  });

  it('stores the cash rounding of a CASH sale paid in cash', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CASH',
      salePayments: [
        { amount: new Prisma.Decimal(15450), paymentMethod: 'CASH' },
      ],
      items: [makeItem({ quantity: 1, unitPrice: new Prisma.Decimal(15483) })],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        total: new Prisma.Decimal(15483),
        rounding: new Prisma.Decimal(33),
      }),
      expect.anything(),
    );
  });

  it('never rounds a CREDIT sale: the installments add up exact', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CREDIT',
      interestRate: null,
      salePayments: [
        { amount: new Prisma.Decimal(5483), paymentMethod: 'CASH' },
      ],
      items: [makeItem({ quantity: 1, unitPrice: new Prisma.Decimal(15483) })],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ rounding: new Prisma.Decimal(0) }),
      expect.anything(),
    );
  });

  it('breaks down the IVA included in each item by the product rate', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CASH',
      salePayments: [],
      items: [
        makeItem({ quantity: 1, unitPrice: new Prisma.Decimal(110000) }),
        makeItem({
          quantity: 2,
          unitPrice: new Prisma.Decimal(52500),
          product: { name: 'Arroz', ivaTaxRate: new Prisma.Decimal(5) },
        }),
        makeItem({
          quantity: 1,
          unitPrice: new Prisma.Decimal(30000),
          product: { name: 'Libro', ivaTaxRate: new Prisma.Decimal(0) },
        }),
        makeItem({
          quantity: 1,
          unitPrice: new Prisma.Decimal(22000),
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
        ivaRate: new Prisma.Decimal(10),
        ivaAmount: new Prisma.Decimal(10000),
        unitPriceWithoutIva: new Prisma.Decimal(100000),
      }),
      expect.objectContaining({
        description: 'Arroz',
        total: new Prisma.Decimal(105000),
        ivaRate: new Prisma.Decimal(5),
        ivaAmount: new Prisma.Decimal(5000),
        unitPriceWithoutIva: new Prisma.Decimal(50000),
      }),
      expect.objectContaining({
        description: 'Libro',
        ivaRate: new Prisma.Decimal(0),
        ivaAmount: new Prisma.Decimal(0),
        unitPriceWithoutIva: new Prisma.Decimal(30000),
      }),
      expect.objectContaining({
        description: 'Flete',
        ivaRate: new Prisma.Decimal(10),
        ivaAmount: new Prisma.Decimal(2000),
      }),
    ]);
  });

  it('invoices a CREDIT sale for the total of its loan, from the financed lines', async () => {
    prisma.loan.findFirst.mockResolvedValue({
      totalAmount: new Prisma.Decimal(1200000),
    });

    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CREDIT',
      items: [
        makeItem({
          quantity: 2,
          unitPrice: new Prisma.Decimal(500000),
          financedUnitPrice: new Prisma.Decimal(600000),
        }),
      ],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: new Prisma.Decimal(1200000) }),
      expect.anything(),
    );
  });

  // Todo lo que se cobra va en la factura; a crédito el recargo lleva el
  // interés, como en el préstamo, y las líneas suman el total de las cuotas.
  it('adds the delivery surcharge as a line with IVA 10%, financed in a CREDIT sale', async () => {
    prisma.loan.findFirst.mockResolvedValue({
      totalAmount: new Prisma.Decimal(1210000),
    });
    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CREDIT',
      interestRate: new Prisma.Decimal(10),
      surchargeType: 'FIXED',
      surchargeAmount: new Prisma.Decimal(100000),
      items: [
        makeItem({
          quantity: 2,
          unitPrice: new Prisma.Decimal(500000),
          financedUnitPrice: new Prisma.Decimal(550000),
        }),
      ],
    });
    const warn = jest.spyOn(listener['logger'], 'warn');

    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Recargo de entrega',
        quantity: 1,
        unitPrice: new Prisma.Decimal(110000),
        total: new Prisma.Decimal(110000),
        ivaRate: new Prisma.Decimal(10),
        ivaAmount: new Prisma.Decimal(10000),
        saleOrderItemId: null,
      }),
      expect.anything(),
    );
    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: new Prisma.Decimal(1210000) }),
      expect.anything(),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('charges the surcharge of a CASH sale without interest', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CASH',
      salePayments: [],
      interestRate: new Prisma.Decimal(10),
      surchargeType: 'PERCENTAGE',
      surchargeAmount: new Prisma.Decimal(5),
      items: [makeItem({ quantity: 2, unitPrice: new Prisma.Decimal(500000) })],
    });

    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: new Prisma.Decimal(1050000) }),
      expect.anything(),
    );
  });

  it('warns when a loan from before the exact amounts does not match the invoice', async () => {
    prisma.loan.findFirst.mockResolvedValue({
      totalAmount: new Prisma.Decimal('1199999.5'),
    });
    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CREDIT',
      items: [
        makeItem({
          quantity: 2,
          unitPrice: new Prisma.Decimal(500000),
          financedUnitPrice: new Prisma.Decimal(600000),
        }),
      ],
    });
    const warn = jest
      .spyOn(listener['logger'], 'warn')
      .mockImplementation(() => undefined);

    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no coincide'));
  });

  it('uses financedUnitPrice (not the cash unitPrice) for CREDIT sale invoice items', async () => {
    prisma.loan.findFirst.mockResolvedValue({
      totalAmount: new Prisma.Decimal(1200000),
    });

    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CREDIT',
      items: [
        makeItem({
          quantity: 2,
          unitPrice: new Prisma.Decimal(500000),
          financedUnitPrice: new Prisma.Decimal(600000),
        }),
      ],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        unitPrice: new Prisma.Decimal(600000),
        total: new Prisma.Decimal(1200000),
      }),
      expect.anything(),
    );
  });

  it('falls back to the cash unitPrice for CREDIT sale items with no financedUnitPrice (legacy items)', async () => {
    prisma.loan.findFirst.mockResolvedValue({
      totalAmount: new Prisma.Decimal(1000000),
    });

    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CREDIT',
      items: [
        makeItem({
          quantity: 2,
          unitPrice: new Prisma.Decimal(500000),
          financedUnitPrice: null,
        }),
      ],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        unitPrice: new Prisma.Decimal(500000),
        total: new Prisma.Decimal(1000000),
      }),
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
          unitPrice: new Prisma.Decimal(500000),
          financedUnitPrice: new Prisma.Decimal(600000),
        }),
      ],
    });
    await listener.handle({ tenantId: TENANT, saleOrderId: ORDER_ID });

    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: new Prisma.Decimal(1200000) }),
      expect.anything(),
    );
  });

  it('emits audit.log after creating the invoice', async () => {
    prisma.saleOrder.findFirst.mockResolvedValue({
      saleType: 'CASH',
      salePayments: [],
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
