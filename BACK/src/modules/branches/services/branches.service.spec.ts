import { NotFoundException } from '@nestjs/common';
import { BranchesService } from './branches.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeBranch(overrides = {}) {
  return {
    id: 'branch-1',
    tenantId: 'tenant-1',
    name: 'Central',
    address: 'Av. España 1234',
    phone: '021 000 000',
    isMain: true,
    isActive: true,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('BranchesService', () => {
  let service: BranchesService;
  let branchesRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    branchesRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    service = new BranchesService(branchesRepository as any);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository', async () => {
      branchesRepository.findAll.mockResolvedValue([makeBranch()]);
      await service.findAll('tenant-1');
      expect(branchesRepository.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the branch when found', async () => {
      branchesRepository.findById.mockResolvedValue(makeBranch());
      const result = await service.findOne('tenant-1', 'branch-1');
      expect(result.id).toBe('branch-1');
    });

    it('throws NotFoundException when branch does not exist', async () => {
      branchesRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('delegates to repository with tenantId and dto', async () => {
      const dto = { name: 'Sucursal Norte', address: 'Av. Artigas 567' };
      branchesRepository.create.mockResolvedValue(
        makeBranch({ ...dto, id: 'branch-2', isMain: false }),
      );
      await service.create('tenant-1', dto);
      expect(branchesRepository.create).toHaveBeenCalledWith('tenant-1', dto);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when branch does not exist', async () => {
      branchesRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('tenant-1', 'ghost', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(branchesRepository.update).not.toHaveBeenCalled();
    });

    it('updates and returns the branch when found', async () => {
      const updated = makeBranch({ name: 'Central Renovada' });
      branchesRepository.findById.mockResolvedValue(makeBranch());
      branchesRepository.update.mockResolvedValue(updated);

      const result = await service.update('tenant-1', 'branch-1', {
        name: 'Central Renovada',
      });

      expect(branchesRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'branch-1',
        { name: 'Central Renovada' },
      );
      expect(result.name).toBe('Central Renovada');
    });

    it('can toggle isActive to false (deactivate)', async () => {
      branchesRepository.findById.mockResolvedValue(makeBranch());
      branchesRepository.update.mockResolvedValue(
        makeBranch({ isActive: false }),
      );

      const result = await service.update('tenant-1', 'branch-1', {
        isActive: false,
      });

      expect(branchesRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'branch-1',
        { isActive: false },
      );
      expect(result.isActive).toBe(false);
    });
  });
});
