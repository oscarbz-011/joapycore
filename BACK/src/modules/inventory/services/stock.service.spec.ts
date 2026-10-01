import { StockService } from './stock.service';

describe('StockService', () => {
  it('delegates tenant and filters to the stock repository', async () => {
    const result = { warehouses: [], items: [] };
    const repository = { findAll: jest.fn().mockResolvedValue(result) };
    const service = new StockService(repository as any);

    await expect(
      service.findAll('tenant-1', { warehouseId: 'wh-1', search: 'tv' }),
    ).resolves.toBe(result);
    expect(repository.findAll).toHaveBeenCalledWith('tenant-1', {
      warehouseId: 'wh-1',
      search: 'tv',
    });
  });
});
