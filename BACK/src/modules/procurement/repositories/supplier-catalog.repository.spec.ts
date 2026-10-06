import { SupplierCatalogRepository } from './supplier-catalog.repository';

describe('SupplierCatalogRepository', () => {
  let repository: SupplierCatalogRepository;
  let prisma: { supplierCatalogItem: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = {
      supplierCatalogItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    repository = new SupplierCatalogRepository(prisma as never);
  });

  describe('findOffers', () => {
    // El comparador cruza proveedores: el filtro por empresa va en el ítem y
    // también en el proveedor, y un proveedor dado de baja no se ofrece.
    it('scopes items and suppliers to the tenant and skips inactive suppliers', async () => {
      await repository.findOffers('tenant-1', ['prod-1', 'prod-2']);

      const [query] = prisma.supplierCatalogItem.findMany.mock.calls[0] as [
        { where: unknown },
      ];
      expect(query.where).toEqual({
        tenantId: 'tenant-1',
        productId: { in: ['prod-1', 'prod-2'] },
        supplier: { tenantId: 'tenant-1', isActive: true, deletedAt: null },
      });
    });

    it('brings the commercial terms of each supplier', async () => {
      await repository.findOffers('tenant-1', ['prod-1']);

      const [query] = prisma.supplierCatalogItem.findMany.mock.calls[0] as [
        { include: { supplier: { select: Record<string, boolean> } } },
      ];
      expect(Object.keys(query.include.supplier.select)).toEqual(
        expect.arrayContaining([
          'paymentTermDays',
          'shippingCost',
          'leadTimeDays',
          'minOrderAmount',
          'volumeDiscounts',
        ]),
      );
    });
  });
});
