import { ConflictException, NotFoundException } from '@nestjs/common';
import { AreasService } from './areas.service';

describe('AreasService', () => {
  let service: AreasService;
  let areasRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  function makeArea(overrides = {}) {
    return {
      id: 'area-1',
      tenantId: 'tenant-1',
      name: 'Ventas',
      parentId: null,
      isActive: true,
      ...overrides,
    };
  }

  beforeEach(() => {
    areasRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    service = new AreasService(areasRepository as any);
  });

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('delegates to areasRepository.findAll', () => {
      areasRepository.findAll.mockResolvedValue([makeArea()]);

      service.list('tenant-1');

      expect(areasRepository.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a new area successfully', async () => {
      areasRepository.create.mockResolvedValue(makeArea());

      const result = await service.create('tenant-1', { name: 'Ventas' });

      // Regla de diseño: nombres de áreas normalizados a MAYÚSCULAS.
      expect(areasRepository.create).toHaveBeenCalledWith('tenant-1', {
        name: 'VENTAS',
      });
      expect(result.name).toBe('Ventas');
    });

    it('throws ConflictException when repository throws (duplicate name)', async () => {
      areasRepository.create.mockRejectedValue(
        new Error('Unique constraint failed'),
      );

      await expect(
        service.create('tenant-1', { name: 'Ventas' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates the area and returns the refreshed record', async () => {
      const updated = makeArea({ name: 'Marketing' });
      areasRepository.findById
        .mockResolvedValueOnce(makeArea()) // existence check
        .mockResolvedValueOnce(updated); // post-update fetch

      const result = await service.update('tenant-1', 'area-1', {
        name: 'Marketing',
      });

      expect(areasRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'area-1',
        { name: 'MARKETING' },
      );
      expect(result?.name).toBe('Marketing');
    });

    it('throws NotFoundException when area does not exist', async () => {
      areasRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('tenant-1', 'ghost', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('can deactivate an area by setting isActive: false', async () => {
      areasRepository.findById
        .mockResolvedValueOnce(makeArea())
        .mockResolvedValueOnce(makeArea({ isActive: false }));

      const result = await service.update('tenant-1', 'area-1', {
        isActive: false,
      });

      expect(areasRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'area-1',
        { isActive: false },
      );
      expect(result?.isActive).toBe(false);
    });
  });
});
