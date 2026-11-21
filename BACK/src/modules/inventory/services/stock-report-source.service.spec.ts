import { StockReportSourceService } from './stock-report-source.service';

describe('StockReportSourceService', () => {
  const setup = (inventoryActive: boolean) => {
    const products = [{ id: 'prod-1' }];
    const repository = {
      findProductsWithMovements: jest.fn().mockResolvedValue(products),
    };
    const modules = { isActive: jest.fn().mockResolvedValue(inventoryActive) };
    return {
      products,
      repository,
      modules,
      source: new StockReportSourceService(
        repository as never,
        modules as never,
      ),
    };
  };

  it('returns the products of the company', async () => {
    const { source, repository, modules, products } = setup(true);

    await expect(source.productsWithMovements('tenant-1')).resolves.toBe(
      products,
    );
    expect(modules.isActive).toHaveBeenCalledWith('tenant-1', 'inventory');
    expect(repository.findProductsWithMovements).toHaveBeenCalledWith(
      'tenant-1',
    );
  });

  it('has no products while Inventario is off', async () => {
    const { source, repository } = setup(false);

    await expect(source.productsWithMovements('tenant-1')).resolves.toEqual([]);
    expect(repository.findProductsWithMovements).not.toHaveBeenCalled();
  });
});
