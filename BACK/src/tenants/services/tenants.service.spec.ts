import { NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service';

function makeTenant(overrides = {}) {
  return {
    id: 'tenant-1',
    name: 'Empresa Demo',
    industry: 'electrodomesticos',
    ...overrides,
  };
}

describe('TenantsService', () => {
  let service: TenantsService;
  let repo: { findById: jest.Mock; update: jest.Mock };
  let filesService: { delete: jest.Mock };

  beforeEach(() => {
    repo = { findById: jest.fn(), update: jest.fn() };
    filesService = { delete: jest.fn().mockResolvedValue(undefined) };
    service = new TenantsService(repo as any, filesService as any);
  });

  // ── getById ────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns tenant when found', async () => {
      repo.findById.mockResolvedValue(makeTenant());
      const result = await service.getById('tenant-1');
      expect(result.id).toBe('tenant-1');
    });

    it('throws NotFoundException when tenant does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getById('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when tenant does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.update('ghost', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('updates and returns tenant when found', async () => {
      const updated = makeTenant({ name: 'Nuevo Nombre' });
      repo.findById.mockResolvedValue(makeTenant());
      repo.update.mockResolvedValue(updated);
      const result = await service.update('tenant-1', { name: 'Nuevo Nombre' });
      expect(result.name).toBe('Nuevo Nombre');
    });

    it('converts timbradoFecha from date string to a Date before persisting', async () => {
      repo.findById.mockResolvedValue(makeTenant());
      repo.update.mockResolvedValue(makeTenant());

      await service.update('tenant-1', { timbradoFecha: '2026-07-16' });

      expect(repo.update).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ timbradoFecha: new Date('2026-07-16') }),
      );
    });

    it('omits timbradoFecha entirely when not provided', async () => {
      repo.findById.mockResolvedValue(makeTenant());
      repo.update.mockResolvedValue(makeTenant());

      await service.update('tenant-1', { name: 'X' });

      const dataArg = repo.update.mock.calls[0][1];
      expect(dataArg).not.toHaveProperty('timbradoFecha');
    });

    it('serializes actividadesEconomicas as JSON input when provided', async () => {
      repo.findById.mockResolvedValue(makeTenant());
      repo.update.mockResolvedValue(makeTenant());
      const actividades = [
        { codigo: 47190, descripcion: 'Venta al por menor' },
      ];

      await service.update('tenant-1', { actividadesEconomicas: actividades });

      expect(repo.update).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ actividadesEconomicas: actividades }),
      );
    });

    it('deletes the previous logo FileRecord when replacing it with a new one', async () => {
      repo.findById.mockResolvedValue(makeTenant({ logoFileId: 'file-old' }));
      repo.update.mockResolvedValue(makeTenant({ logoFileId: 'file-new' }));

      await service.update('tenant-1', { logoFileId: 'file-new' });

      expect(filesService.delete).toHaveBeenCalledWith('tenant-1', 'file-old');
    });

    it('deletes the previous logo FileRecord when removing the logo (logoFileId: null)', async () => {
      repo.findById.mockResolvedValue(makeTenant({ logoFileId: 'file-old' }));
      repo.update.mockResolvedValue(makeTenant({ logoFileId: null }));

      await service.update('tenant-1', { logoFileId: null });

      expect(filesService.delete).toHaveBeenCalledWith('tenant-1', 'file-old');
    });

    it('does not touch FilesService when logoFileId is not part of the update', async () => {
      repo.findById.mockResolvedValue(makeTenant({ logoFileId: 'file-old' }));
      repo.update.mockResolvedValue(
        makeTenant({ logoFileId: 'file-old', name: 'X' }),
      );

      await service.update('tenant-1', { name: 'X' });

      expect(filesService.delete).not.toHaveBeenCalled();
    });

    it('does not fail the update if deleting the old logo file errors', async () => {
      repo.findById.mockResolvedValue(makeTenant({ logoFileId: 'file-old' }));
      repo.update.mockResolvedValue(makeTenant({ logoFileId: 'file-new' }));
      filesService.delete.mockRejectedValue(new Error('already gone'));

      await expect(
        service.update('tenant-1', { logoFileId: 'file-new' }),
      ).resolves.toBeDefined();
    });
  });
});
