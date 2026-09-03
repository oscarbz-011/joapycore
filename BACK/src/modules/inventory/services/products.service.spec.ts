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
    isActive: true,
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
