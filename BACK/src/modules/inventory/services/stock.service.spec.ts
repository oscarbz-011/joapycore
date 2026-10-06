import { StockService } from './stock.service';

const row = (id: string, stockMin: number) => ({
  product: {
    id,
    name: id,
    model: null,
    category: null,
    brand: null,
    salesChannels: ['NORMAL'],
    salePrice: 100,
    stockMin,
  },
  totalStock: 3,
  stockByWarehouse: [],
  unassignedStock: 0,
});

describe('StockService', () => {
  const setup = (threshold: number | null) => {
    const repository = {
      findAll: jest.fn().mockResolvedValue({
        warehouses: [],
        items: [row('own-min', 10), row('no-min', 0)],
      }),
    };
    const alerts = {
      findActiveThreshold: jest.fn().mockResolvedValue(threshold),
    };
    return {
      repository,
      alerts,
      service: new StockService(repository as any, alerts as any),
    };
  };

  it('delegates tenant and filters to the stock repository', async () => {
    const { service, repository, alerts } = setup(null);

    await service.findAll('tenant-1', { warehouseId: 'wh-1', search: 'tv' });

    expect(repository.findAll).toHaveBeenCalledWith('tenant-1', {
      warehouseId: 'wh-1',
      search: 'tv',
    });
    expect(alerts.findActiveThreshold).toHaveBeenCalledWith(
      'tenant-1',
      'STOCK_LOW',
    );
  });

  it('uses the product minimum first and the stock alert threshold otherwise', async () => {
    const { service } = setup(5);

    const { items } = await service.findAll('tenant-1', {});

    expect(items.map((item) => item.product)).toEqual([
      expect.objectContaining({
        id: 'own-min',
        reorderPoint: 10,
        reorderPointSource: 'PRODUCT',
      }),
      expect.objectContaining({
        id: 'no-min',
        reorderPoint: 5,
        reorderPointSource: 'ALERT',
      }),
    ]);
  });

  it('has no reorder point without a product minimum or an active alert', async () => {
    const { service } = setup(null);

    const { items } = await service.findAll('tenant-1', {});

    expect(items[1].product).toMatchObject({
      reorderPoint: 0,
      reorderPointSource: null,
    });
  });
});
