import { InventoryOnInvoiceListener } from './inventory-on-invoice.listener';

function makeItem(overrides = {}) {
  return {
    id: 'item-1',
    productId: 'prod-1',
    quantity: 3,
    product: { isSerialized: false },
    ...overrides,
  };
}

describe('InventoryOnInvoiceListener', () => {
  let listener: InventoryOnInvoiceListener;
  let prisma: {
    invoice: { findUnique: jest.Mock };
    $transaction: jest.Mock;
    stockMovement: { findFirst: jest.Mock; create: jest.Mock };
    productUnit: { updateMany: jest.Mock };
  };

  beforeEach(() => {
    const tx = {
      stockMovement: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      productUnit: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    prisma = {
      invoice: { findUnique: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
      stockMovement: tx.stockMovement,
      productUnit: tx.productUnit,
    };
    listener = new InventoryOnInvoiceListener(prisma as any);
  });

  it('does nothing when invoice has no linked saleOrder', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      saleOrderId: null,
      saleOrder: null,
    });

    await listener.handle({ tenantId: 'tenant-1', invoiceId: 'inv-1' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does nothing when invoice is not found', async () => {
    prisma.invoice.findUnique.mockResolvedValue(null);

    await listener.handle({ tenantId: 'tenant-1', invoiceId: 'inv-1' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates IN movements for non-serialized items to restore stock', async () => {
    const tx = {
      stockMovement: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      productUnit: { updateMany: jest.fn() },
    };
    prisma.$transaction.mockImplementation((cb) => cb(tx));

    prisma.invoice.findUnique.mockResolvedValue({
      saleOrderId: 'order-1',
      saleOrder: { items: [makeItem({ quantity: 3 })] },
    });

    await listener.handle({ tenantId: 'tenant-1', invoiceId: 'inv-1' });

    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          productId: 'prod-1',
          type: 'IN',
          quantity: 3,
          referenceId: 'inv-1',
        }),
      }),
    );
    expect(tx.productUnit.updateMany).not.toHaveBeenCalled();
  });

  it('resets serialized units to IN_STOCK and clears saleOrderItemId', async () => {
    const tx = {
      stockMovement: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      productUnit: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    prisma.$transaction.mockImplementation((cb) => cb(tx));

    prisma.invoice.findUnique.mockResolvedValue({
      saleOrderId: 'order-1',
      saleOrder: {
        items: [makeItem({ product: { isSerialized: true } })],
      },
    });

    await listener.handle({ tenantId: 'tenant-1', invoiceId: 'inv-1' });

    expect(tx.productUnit.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', saleOrderItemId: 'item-1' },
      data: { status: 'IN_STOCK', saleOrderItemId: null },
    });
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('skips processing when a reversal IN movement already exists (idempotency)', async () => {
    const tx = {
      stockMovement: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-reversal' }),
        create: jest.fn(),
      },
      productUnit: { updateMany: jest.fn() },
    };
    prisma.$transaction.mockImplementation((cb) => cb(tx));

    prisma.invoice.findUnique.mockResolvedValue({
      saleOrderId: 'order-1',
      saleOrder: { items: [makeItem()] },
    });

    await listener.handle({ tenantId: 'tenant-1', invoiceId: 'inv-1' });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.productUnit.updateMany).not.toHaveBeenCalled();
  });
});
