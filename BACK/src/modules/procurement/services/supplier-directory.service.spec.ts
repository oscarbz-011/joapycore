import { SupplierDirectoryService } from './supplier-directory.service';

describe('SupplierDirectoryService', () => {
  const setup = (procurementActive: boolean, supplier: unknown) => {
    const suppliers = { findById: jest.fn().mockResolvedValue(supplier) };
    const modules = {
      isActive: jest.fn().mockResolvedValue(procurementActive),
    };
    return {
      suppliers,
      modules,
      directory: new SupplierDirectoryService(
        suppliers as never,
        modules as never,
      ),
    };
  };

  it('finds an active supplier of the company', async () => {
    const { directory, suppliers, modules } = setup(true, {
      id: 'sup-1',
      isActive: true,
    });

    await expect(directory.findActive('tenant-1', 'sup-1')).resolves.toEqual({
      id: 'sup-1',
    });
    expect(modules.isActive).toHaveBeenCalledWith('tenant-1', 'procurement');
    expect(suppliers.findById).toHaveBeenCalledWith('tenant-1', 'sup-1');
  });

  it('ignores an inactive or missing supplier', async () => {
    await expect(
      setup(true, { id: 'sup-1', isActive: false }).directory.findActive(
        'tenant-1',
        'sup-1',
      ),
    ).resolves.toBeNull();
    await expect(
      setup(true, null).directory.findActive('tenant-1', 'sup-1'),
    ).resolves.toBeNull();
  });

  it('has no suppliers while Compras is off', async () => {
    const { directory, suppliers } = setup(false, {
      id: 'sup-1',
      isActive: true,
    });

    await expect(directory.findActive('tenant-1', 'sup-1')).resolves.toBeNull();
    expect(suppliers.findById).not.toHaveBeenCalled();
  });
});
