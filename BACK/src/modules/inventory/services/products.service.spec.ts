import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ProductsService } from './products.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduct(overrides = {}) {
  return {
    id: 'prod-1',
    tenantId: 'tenant-1',
    name: 'Heladera Samsung',
    model: 'HRT-500',
    description: null,
    isSerialized: false,
    unit: 'unidad',
    costPrice: 2_000_000,
    salePrice: 2_500_000,
    categoryId: 'cat-1',
    status: 'ACTIVE' as const,
    deletedAt: null,
    brand: { id: 'brand-1', name: 'Samsung' },
    category: { id: 'cat-1', name: 'Heladeras' },
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ProductsService', () => {
  let service: ProductsService;
  let productsRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
    getStock: jest.Mock;
    getSerializedStock: jest.Mock;
    findTenantIndustry: jest.Mock;
  };
  let productUnitsRepository: {
    createMany: jest.Mock;
    findByProduct: jest.Mock;
  };
  let productSuppliersRepository: {
    findByProduct: jest.Mock;
    findOne: jest.Mock;
    supplierExistsForTenant: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    clearPreferred: jest.Mock;
  };
  let productBatchesRepository: {
    findByProduct: jest.Mock;
    findAll: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    productsRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      getStock: jest.fn().mockResolvedValue(10),
      getSerializedStock: jest.fn().mockResolvedValue(3),
      // Rubro del tenant — define el ProductKind por defecto al crear.
      findTenantIndustry: jest.fn().mockResolvedValue('ELECTRODOMESTICOS'),
    };
    productUnitsRepository = {
      createMany: jest.fn(),
      findByProduct: jest.fn(),
    };
    productSuppliersRepository = {
      findByProduct: jest.fn(),
      findOne: jest.fn(),
      supplierExistsForTenant: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      clearPreferred: jest.fn(),
    };
    productBatchesRepository = {
      findByProduct: jest.fn(),
      findAll: jest.fn(),
    };
    eventEmitter = { emit: jest.fn() };

    service = new ProductsService(
      productsRepository as any,
      productUnitsRepository as any,
      productSuppliersRepository as any,
      productBatchesRepository as any,
      eventEmitter as any,
    );
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates filters to repository', () => {
      const filters = { search: 'heladera', categoryId: 'cat-1' };
      productsRepository.findAll.mockResolvedValue([makeProduct()]);

      service.findAll('tenant-1', filters);

      expect(productsRepository.findAll).toHaveBeenCalledWith(
        'tenant-1',
        filters,
      );
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the product when found', async () => {
      productsRepository.findById.mockResolvedValue(makeProduct());

      const result = await service.findOne('tenant-1', 'prod-1');

      expect(result.id).toBe('prod-1');
    });

    it('throws NotFoundException when product does not exist', async () => {
      productsRepository.findById.mockResolvedValue(null);

      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── findOneWithStock ───────────────────────────────────────────────────────

  describe('findOneWithStock', () => {
    it('uses getStock for non-serialized products', async () => {
      productsRepository.findById.mockResolvedValue(
        makeProduct({ isSerialized: false }),
      );

      const result = await service.findOneWithStock('tenant-1', 'prod-1');

      expect(productsRepository.getStock).toHaveBeenCalledWith(
        'tenant-1',
        'prod-1',
      );
      expect(productsRepository.getSerializedStock).not.toHaveBeenCalled();
      expect(result.stock).toBe(10);
    });

    it('uses getSerializedStock for serialized products', async () => {
      productsRepository.findById.mockResolvedValue(
        makeProduct({ isSerialized: true }),
      );

      const result = await service.findOneWithStock('tenant-1', 'prod-1');

      expect(productsRepository.getSerializedStock).toHaveBeenCalledWith(
        'tenant-1',
        'prod-1',
      );
      expect(productsRepository.getStock).not.toHaveBeenCalled();
      expect(result.stock).toBe(3);
    });

    it('throws NotFoundException if product does not exist', async () => {
      productsRepository.findById.mockResolvedValue(null);

      await expect(
        service.findOneWithStock('tenant-1', 'ghost'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      categoryId: 'cat-1',
      brandId: 'brand-1',
      name: 'Heladera Samsung',
      isSerialized: false,
      costPrice: 2_000_000,
      salePrice: 2_500_000,
    };

    it('passes dto fields to repository with default unit', async () => {
      productsRepository.create.mockResolvedValue(makeProduct());

      await service.create('tenant-1', baseDto);

      expect(productsRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ name: 'Heladera Samsung', unit: 'unidad' }),
      );
    });

    it('uses provided unit when given', async () => {
      productsRepository.create.mockResolvedValue(makeProduct());

      await service.create('tenant-1', { ...baseDto, unit: 'caja' });

      expect(productsRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ unit: 'caja' }),
      );
    });

    // ── Multi-rubro: tipo de producto ────────────────────────────────────

    it('defaults to RESALE for a tenant that resells (ferretería)', async () => {
      productsRepository.findTenantIndustry.mockResolvedValue('FERRETERIA');
      productsRepository.create.mockResolvedValue(makeProduct());

      await service.create('tenant-1', baseDto);

      expect(productsRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          kind: 'RESALE',
          isPurchasable: true,
          isSellable: true,
        }),
      );
    });

    it('defaults to MANUFACTURED for a carpintería — lo que vende, lo fabrica', async () => {
      productsRepository.findTenantIndustry.mockResolvedValue('MUEBLERIA');
      productsRepository.create.mockResolvedValue(makeProduct());

      await service.create('tenant-1', baseDto);

      expect(productsRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          kind: 'MANUFACTURED',
          // No se le compra a un proveedor: sale de una orden de producción.
          isPurchasable: false,
          isSellable: true,
        }),
      );
    });

    it('falls back to RESALE when the tenant has no rubro', async () => {
      productsRepository.findTenantIndustry.mockResolvedValue(null);
      productsRepository.create.mockResolvedValue(makeProduct());

      await service.create('tenant-1', baseDto);

      expect(productsRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ kind: 'RESALE' }),
      );
    });

    it('an explicit kind wins over the rubro default', async () => {
      productsRepository.findTenantIndustry.mockResolvedValue('MUEBLERIA');
      productsRepository.create.mockResolvedValue(makeProduct());

      await service.create('tenant-1', { ...baseDto, kind: 'RAW_MATERIAL' });

      expect(productsRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          kind: 'RAW_MATERIAL',
          // La madera se compra pero no se vende en el mostrador.
          isPurchasable: true,
          isSellable: false,
        }),
      );
      // No hace falta consultar el rubro si el caller ya definió el tipo.
      expect(productsRepository.findTenantIndustry).not.toHaveBeenCalled();
    });

    it('explicit flags win over the kind defaults — el tornillo que además se vende suelto', async () => {
      productsRepository.findTenantIndustry.mockResolvedValue('MUEBLERIA');
      productsRepository.create.mockResolvedValue(makeProduct());

      await service.create('tenant-1', {
        ...baseDto,
        kind: 'RAW_MATERIAL',
        isSellable: true,
      });

      expect(productsRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          kind: 'RAW_MATERIAL',
          isPurchasable: true,
          isSellable: true,
        }),
      );
    });

    it('creates as ACTIVE when the ficha comes complete', async () => {
      productsRepository.create.mockResolvedValue(makeProduct());

      await service.create('tenant-1', baseDto);

      expect(productsRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ status: 'ACTIVE' }),
      );
    });

    it('creates as DRAFT when prices are missing, instead of rejecting', async () => {
      productsRepository.create.mockResolvedValue(makeProduct());

      await service.create('tenant-1', {
        ...baseDto,
        costPrice: undefined,
        salePrice: undefined,
      });

      expect(productsRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ status: 'DRAFT' }),
      );
    });

    it('creates as DRAFT when the category is missing', async () => {
      productsRepository.create.mockResolvedValue(makeProduct());

      await service.create('tenant-1', { ...baseDto, categoryId: undefined });

      expect(productsRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ status: 'DRAFT' }),
      );
    });
  });

  // ── missingToActivate ──────────────────────────────────────────────────────

  describe('missingToActivate', () => {
    const complete = {
      costPrice: 100,
      salePrice: 150,
      categoryId: 'cat-1',
      unit: 'unidad',
    };

    it('returns an empty list for a complete ficha', () => {
      expect(ProductsService.missingToActivate(complete)).toEqual([]);
    });

    it('lists every missing requirement at once, not just the first', () => {
      expect(
        ProductsService.missingToActivate({
          costPrice: null,
          salePrice: null,
          categoryId: null,
          unit: null,
        }),
      ).toEqual([
        'precio de costo',
        'precio de venta',
        'categoría',
        'unidad de medida',
      ]);
    });

    it('treats a price of 0 as missing — null is "pendiente", 0 is not a real price here', () => {
      expect(
        ProductsService.missingToActivate({ ...complete, costPrice: 0 }),
      ).toEqual(['precio de costo']);
    });

    it('reads Prisma Decimal values, not just plain numbers', () => {
      expect(
        ProductsService.missingToActivate({
          ...complete,
          costPrice: { toNumber: () => 100 },
          salePrice: { toNumber: () => 150 },
        }),
      ).toEqual([]);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException if product not found', async () => {
      productsRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('tenant-1', 'ghost', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(productsRepository.update).not.toHaveBeenCalled();
    });

    it('updates and returns the refreshed product', async () => {
      const updated = makeProduct({ name: 'Heladera LG' });
      productsRepository.findById
        .mockResolvedValueOnce(makeProduct())
        .mockResolvedValueOnce(updated);

      const result = await service.update('tenant-1', 'prod-1', {
        name: 'Heladera LG',
      });

      expect(productsRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'prod-1',
        expect.objectContaining({ name: 'Heladera LG' }),
      );
      expect(result?.name).toBe('Heladera LG');
    });

    it('refuses to activate a ficha that is still missing data', async () => {
      productsRepository.findById.mockResolvedValue(
        makeProduct({ costPrice: null, salePrice: null }),
      );

      await expect(
        service.update('tenant-1', 'prod-1', { status: 'ACTIVE' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(productsRepository.update).not.toHaveBeenCalled();
    });

    it('names what is missing so the UI can show the checklist', async () => {
      productsRepository.findById.mockResolvedValue(
        makeProduct({ costPrice: null, categoryId: null }),
      );

      await expect(
        service.update('tenant-1', 'prod-1', { status: 'ACTIVE' }),
      ).rejects.toThrow(/precio de costo, categoría/);
    });

    it('allows completing the ficha and activating in the same request', async () => {
      // Validar contra lo ya guardado (sin precio) en vez del resultado del
      // update haría fallar este caso, que es el flujo normal desde la UI.
      const draft = makeProduct({
        status: 'DRAFT',
        costPrice: null,
        salePrice: null,
      });
      productsRepository.findById
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(makeProduct());

      await service.update('tenant-1', 'prod-1', {
        costPrice: 100,
        salePrice: 150,
        status: 'ACTIVE',
      });

      expect(productsRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'prod-1',
        expect.objectContaining({ status: 'ACTIVE' }),
      );
    });

    it('does not validate requirements when moving to a non-ACTIVE status', async () => {
      productsRepository.findById
        .mockResolvedValueOnce(makeProduct({ costPrice: null }))
        .mockResolvedValueOnce(makeProduct({ status: 'BLOCKED' }));

      await service.update('tenant-1', 'prod-1', { status: 'BLOCKED' });

      expect(productsRepository.update).toHaveBeenCalled();
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('throws NotFoundException if product not found', async () => {
      productsRepository.findById.mockResolvedValue(null);

      await expect(service.delete('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(productsRepository.softDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes the product when found', async () => {
      productsRepository.findById.mockResolvedValue(makeProduct());

      await service.delete('tenant-1', 'prod-1');

      expect(productsRepository.softDelete).toHaveBeenCalledWith(
        'tenant-1',
        'prod-1',
      );
    });
  });

  // ── addUnits ───────────────────────────────────────────────────────────────

  describe('addUnits', () => {
    it('throws UnprocessableEntityException for non-serialized product', async () => {
      productsRepository.findById.mockResolvedValue(
        makeProduct({ isSerialized: false }),
      );

      await expect(
        service.addUnits('tenant-1', 'prod-1', { serialNumbers: ['SN001'] }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(productUnitsRepository.createMany).not.toHaveBeenCalled();
    });

    it('creates units and emits stock.movement.created for serialized product', async () => {
      productsRepository.findById.mockResolvedValue(
        makeProduct({ isSerialized: true }),
      );
      productUnitsRepository.createMany.mockResolvedValue({ count: 2 });

      const result = await service.addUnits('tenant-1', 'prod-1', {
        serialNumbers: ['SN001', 'SN002'],
      });

      expect(productUnitsRepository.createMany).toHaveBeenCalledWith(
        'tenant-1',
        'prod-1',
        ['SN001', 'SN002'],
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'stock.movement.created',
        expect.objectContaining({
          tenantId: 'tenant-1',
          productId: 'prod-1',
          type: 'IN',
          quantity: 2,
        }),
      );
      expect(result.created).toBe(2);
    });
  });
});
