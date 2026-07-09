import { NotFoundException } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';

function makeWarehouse(overrides = {}) {
  return {
    id: 'wh-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    name: 'Depósito Principal',
    address: null,
    isDefault: true,
    isActive: true,
    branch: { id: 'branch-1', name: 'Casa Matriz' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('WarehousesService', () => {
  let service: WarehousesService;
  let repo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    service = new WarehousesService(repo as any);
  });

  describe('findAll', () => {
    it('delegates to repository', () => {
      repo.findAll.mockResolvedValue([makeWarehouse()]);
      service.findAll('tenant-1');
      expect(repo.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  describe('findOne', () => {
    it('returns the warehouse when found', async () => {
      repo.findById.mockResolvedValue(makeWarehouse());
      const result = await service.findOne('tenant-1', 'wh-1');
      expect(result.id).toBe('wh-1');
    });

    it('throws NotFoundException when warehouse does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('delegates to repository with tenantId and dto', () => {
      const dto = { name: 'Depósito Norte', branchId: 'branch-2' };
      repo.create.mockResolvedValue(makeWarehouse({ ...dto, id: 'wh-2', isDefault: false }));
      service.create('tenant-1', dto as any);
      expect(repo.create).toHaveBeenCalledWith('tenant-1', dto);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when warehouse does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update('tenant-1', 'ghost', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('updates and returns the warehouse when found', async () => {
      const updated = makeWarehouse({ name: 'Depósito Renovado' });
      repo.findById.mockResolvedValue(makeWarehouse());
      repo.update.mockResolvedValue(updated);

      const result = await service.update('tenant-1', 'wh-1', { name: 'Depósito Renovado' });

      expect(repo.update).toHaveBeenCalledWith('tenant-1', 'wh-1', { name: 'Depósito Renovado' });
      expect(result.name).toBe('Depósito Renovado');
    });

    it('can toggle isActive to false', async () => {
      repo.findById.mockResolvedValue(makeWarehouse());
      repo.update.mockResolvedValue(makeWarehouse({ isActive: false }));

      const result = await service.update('tenant-1', 'wh-1', { isActive: false });

      expect(repo.update).toHaveBeenCalledWith('tenant-1', 'wh-1', { isActive: false });
      expect(result.isActive).toBe(false);
    });
  });
});
