import { ConflictException, NotFoundException } from '@nestjs/common';
import { BrandsService } from './brands.service';

function makeBrand(overrides = {}) {
  return { id: 'brand-1', tenantId: 'tenant-1', name: 'Samsung', isActive: true, ...overrides };
}

describe('BrandsService', () => {
  let service: BrandsService;
  let repo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findByName: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    service = new BrandsService(repo as any);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository', () => {
      repo.findAll.mockResolvedValue([makeBrand()]);
      service.findAll('tenant-1');
      expect(repo.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns brand when found', async () => {
      repo.findById.mockResolvedValue(makeBrand());
      const result = await service.findOne('tenant-1', 'brand-1');
      expect(result.id).toBe('brand-1');
    });

    it('throws NotFoundException when brand does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates brand when name is unique', async () => {
      repo.findByName.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeBrand());
      await service.create('tenant-1', { name: 'Samsung' });
      // Regla de diseño: marcas en MAYÚSCULAS.
      expect(repo.create).toHaveBeenCalledWith('tenant-1', 'SAMSUNG');
    });

    it('throws ConflictException when brand name already exists', async () => {
      repo.findByName.mockResolvedValue(makeBrand());
      await expect(service.create('tenant-1', { name: 'Samsung' })).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when brand does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update('tenant-1', 'x', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('updates and returns brand when found', async () => {
      const updated = makeBrand({ name: 'LG' });
      repo.findById.mockResolvedValueOnce(makeBrand()).mockResolvedValueOnce(updated);
      repo.update.mockResolvedValue(undefined);
      const result = await service.update('tenant-1', 'brand-1', { name: 'LG' });
      expect(result?.name).toBe('LG');
    });

    it('can toggle isActive on a brand', async () => {
      const inactive = makeBrand({ isActive: false });
      repo.findById.mockResolvedValueOnce(makeBrand()).mockResolvedValueOnce(inactive);
      repo.update.mockResolvedValue(undefined);
      const result = await service.update('tenant-1', 'brand-1', { isActive: false });
      expect(result?.isActive).toBe(false);
    });
  });
});
