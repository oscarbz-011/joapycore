import { NotFoundException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSupplier(overrides = {}) {
  return {
    id: 'sup-1',
    tenantId: 'tenant-1',
    name: 'Importadora ABC',
    contactName: 'Juan Pérez',
    email: 'ventas@abc.com',
    phone: '021000000',
    address: 'Asunción',
    taxId: '80012345-6',
    isImporter: true,
    isActive: true,
    deletedAt: null,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SuppliersService', () => {
  let service: SuppliersService;
  let suppliersRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
  };

  beforeEach(() => {
    suppliersRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    service = new SuppliersService(suppliersRepository as any);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository', async () => {
      suppliersRepository.findAll.mockResolvedValue([makeSupplier()]);
      await service.findAll('tenant-1');
      expect(suppliersRepository.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns supplier when found', async () => {
      suppliersRepository.findById.mockResolvedValue(makeSupplier());
      const result = await service.findOne('tenant-1', 'sup-1');
      expect(result.id).toBe('sup-1');
    });

    it('throws NotFoundException when supplier does not exist', async () => {
      suppliersRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('delegates to repository with tenantId and dto', async () => {
      const dto = { name: 'Importadora ABC', isImporter: true };
      suppliersRepository.create.mockResolvedValue(makeSupplier());

      await service.create('tenant-1', dto);

      expect(suppliersRepository.create).toHaveBeenCalledWith('tenant-1', dto);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException if supplier does not exist', async () => {
      suppliersRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('tenant-1', 'ghost', { name: 'Nuevo nombre' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(suppliersRepository.update).not.toHaveBeenCalled();
    });

    it('updates supplier when found and returns refreshed data', async () => {
      const updated = makeSupplier({ name: 'Nuevo nombre' });
      suppliersRepository.findById
        .mockResolvedValueOnce(makeSupplier())
        .mockResolvedValueOnce(updated);
      suppliersRepository.update.mockResolvedValue(undefined);

      const result = await service.update('tenant-1', 'sup-1', {
        name: 'Nuevo nombre',
      });

      expect(suppliersRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'sup-1',
        expect.objectContaining({ name: 'Nuevo nombre' }),
      );
      expect(result?.name).toBe('Nuevo nombre');
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('throws NotFoundException if supplier does not exist', async () => {
      suppliersRepository.findById.mockResolvedValue(null);

      await expect(service.delete('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(suppliersRepository.softDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes the supplier when found', async () => {
      suppliersRepository.findById.mockResolvedValue(makeSupplier());

      await service.delete('tenant-1', 'sup-1');

      expect(suppliersRepository.softDelete).toHaveBeenCalledWith(
        'tenant-1',
        'sup-1',
      );
    });
  });
});
