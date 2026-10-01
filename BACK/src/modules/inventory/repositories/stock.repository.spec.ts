import { StockRepository } from './stock.repository';

describe('StockRepository', () => {
  let repository: StockRepository;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      warehouse: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'wh-active', name: 'Central', isActive: true },
          { id: 'wh-inactive', name: 'Anterior', isActive: false },
        ]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'plain',
            name: 'Producto común',
            model: null,
            isSerialized: false,
            salesChannels: ['NORMAL'],
            category: null,
            brand: null,
          },
          {
            id: 'serial',
            name: 'Producto serial',
            model: 'S-1',
            isSerialized: true,
            salesChannels: ['POS'],
            category: null,
            brand: null,
          },
          {
            id: 'zero',
            name: 'Producto sin existencia',
            model: null,
            isSerialized: false,
            salesChannels: ['NORMAL'],
            category: null,
            brand: null,
          },
        ]),
      },
      stockMovement: {
        groupBy: jest.fn().mockResolvedValue([
          {
            productId: 'plain',
            warehouseId: 'wh-active',
            _sum: { quantity: 4 },
          },
          {
            productId: 'plain',
            warehouseId: 'wh-inactive',
            _sum: { quantity: 2 },
          },
          {
            productId: 'plain',
            warehouseId: null,
            _sum: { quantity: 1 },
          },
        ]),
      },
      productUnit: {
        groupBy: jest.fn().mockResolvedValue([
          {
            productId: 'serial',
            warehouseId: 'wh-active',
            _count: { id: 3 },
          },
          {
            productId: 'serial',
            warehouseId: null,
            _count: { id: 1 },
          },
        ]),
      },
    };
    repository = new StockRepository(prisma);
  });

  it('projects movement and serialized stock, zero rows, null locations, and inactive locations with quantity', async () => {
    const result = await repository.findAll('tenant-1', {});

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          status: 'ACTIVE',
          salesChannels: { isEmpty: false },
        }),
      }),
    );
    expect(result.warehouses).toEqual([
      { id: 'wh-active', name: 'Central', isActive: true },
      { id: 'wh-inactive', name: 'Anterior', isActive: false },
    ]);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product: expect.objectContaining({ id: 'plain' }),
          totalStock: 7,
          unassignedStock: 1,
          stockByWarehouse: [
            expect.objectContaining({ warehouseId: 'wh-active', quantity: 4 }),
            expect.objectContaining({
              warehouseId: 'wh-inactive',
              quantity: 2,
            }),
          ],
        }),
        expect.objectContaining({
          product: expect.objectContaining({ id: 'serial' }),
          totalStock: 4,
          unassignedStock: 1,
        }),
        expect.objectContaining({
          product: expect.objectContaining({ id: 'zero' }),
          totalStock: 0,
          unassignedStock: 0,
        }),
      ]),
    );
  });

  it('keeps company totals and zero rows when one warehouse is selected', async () => {
    const result = await repository.findAll('tenant-1', {
      warehouseId: 'wh-inactive',
    });

    expect(
      result.items.find((row) => row.product.id === 'plain'),
    ).toMatchObject({
      totalStock: 7,
      stockByWarehouse: [
        expect.objectContaining({
          warehouseId: 'wh-inactive',
          quantity: 2,
        }),
      ],
    });
    expect(result.items.find((row) => row.product.id === 'zero')).toMatchObject(
      {
        totalStock: 0,
        stockByWarehouse: [
          expect.objectContaining({
            warehouseId: 'wh-inactive',
            quantity: 0,
          }),
        ],
      },
    );
  });
});
