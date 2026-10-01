import { ProductUnitsRepository } from './product-units.repository';

describe('ProductUnitsRepository', () => {
  let repository: ProductUnitsRepository;
  let prisma: { productUnit: { updateMany: jest.Mock } };

  beforeEach(() => {
    prisma = {
      productUnit: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    repository = new ProductUnitsRepository(prisma as any);
  });

  it('moves only selected in-stock serials from the origin warehouse', async () => {
    const moved = await (repository as any).moveInStockUnits(
      'tenant-1',
      'prod-1',
      ['SN-1', 'SN-2'],
      'wh-origin',
      'wh-destination',
      prisma,
    );

    expect(prisma.productUnit.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        productId: 'prod-1',
        serialNumber: { in: ['SN-1', 'SN-2'] },
        status: 'IN_STOCK',
        warehouseId: 'wh-origin',
      },
      data: { warehouseId: 'wh-destination' },
    });
    expect(moved).toBe(2);
  });

  it('marks only selected in-stock serials as ADJUSTED_OUT', async () => {
    const changed = await (repository as any).markAdjustedOut(
      'tenant-1',
      'prod-1',
      ['SN-1'],
      'wh-1',
      prisma,
    );

    expect(prisma.productUnit.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        productId: 'prod-1',
        serialNumber: { in: ['SN-1'] },
        status: 'IN_STOCK',
        warehouseId: 'wh-1',
      },
      data: { status: 'ADJUSTED_OUT' },
    });
    expect(changed).toBe(2);
  });
});
