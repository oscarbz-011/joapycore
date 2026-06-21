import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

function makeCategory(overrides = {}) {
  return { id: 'cat-1', tenantId: 'tenant-1', name: 'Televisores', isActive: true, ...overrides };
}

describe('CategoriesService', () => {
  let service: CategoriesService;
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
    service = new CategoriesService(repo as any);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository', () => {
      repo.findAll.mockResolvedValue([makeCategory()]);
      service.findAll('tenant-1');
      expect(repo.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns category when found', async () => {
      repo.findById.mockResolvedValue(makeCategory());
      const result = await service.findOne('tenant-1', 'cat-1');
      expect(result.id).toBe('cat-1');
    });

    it('throws NotFoundException when category does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates category when name is unique (case-insensitive)', async () => {
      repo.findAll.mockResolvedValue([]);
      repo.create.mockResolvedValue(makeCategory());
      await service.create('tenant-1', { name: 'Televisores' });
      expect(repo.create).toHaveBeenCalledWith('tenant-1', 'Televisores');
    });

    it('throws ConflictException when name already exists (case-insensitive)', async () => {
      repo.findAll.mockResolvedValue([makeCategory({ name: 'televisores' })]);
      await expect(service.create('tenant-1', { name: 'TELEVISORES' })).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when category does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update('tenant-1', 'x', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('updates and returns category when found', async () => {
      const updated = makeCategory({ name: 'Aires Acondicionados' });
      repo.findById.mockResolvedValueOnce(makeCategory()).mockResolvedValueOnce(updated);
      repo.update.mockResolvedValue(undefined);
      const result = await service.update('tenant-1', 'cat-1', { name: 'Aires Acondicionados' });
      expect(result?.name).toBe('Aires Acondicionados');
    });
  });
});
