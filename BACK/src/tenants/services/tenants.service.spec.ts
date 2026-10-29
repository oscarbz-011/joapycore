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

  // ── brand / logo ───────────────────────────────────────────────────────────

  describe('brand', () => {
    it('names the company by its trade name when it has one', async () => {
      repo.findById.mockResolvedValue(
        makeTenant({
          nombreFantasia: ' Ferro ',
          razonSocial: 'Ferro S.A.',
          ruc: '80012345-6',
          logoFileId: 'logo-1',
        }),
      );

      await expect(service.brand('tenant-1')).resolves.toEqual({
        id: 'tenant-1',
        name: 'Ferro',
        razonSocial: 'Ferro S.A.',
        ruc: '80012345-6',
        hasLogo: true,
      });
      expect(repo.findById).toHaveBeenCalledWith('tenant-1');
    });

    it('falls back to the registered name', async () => {
      repo.findById.mockResolvedValue(
        makeTenant({ nombreFantasia: '  ', logoFileId: null }),
      );

      await expect(service.brand('tenant-1')).resolves.toMatchObject({
        name: 'Empresa Demo',
        hasLogo: false,
      });
    });
  });

  describe('logo', () => {
    const files = () =>
      filesService as unknown as {
        getById: jest.Mock;
        getFileBuffer: jest.Mock;
      };

    beforeEach(() => {
      Object.assign(filesService, {
        getById: jest
          .fn()
          .mockResolvedValue({ id: 'logo-1', mimeType: 'image/png' }),
        getFileBuffer: jest.fn().mockResolvedValue(Buffer.from('png')),
      });
    });

    it('serves the logo of the company, read inside the same company', async () => {
      repo.findById.mockResolvedValue(makeTenant({ logoFileId: 'logo-1' }));

      await expect(service.logo('tenant-1')).resolves.toEqual({
        mimeType: 'image/png',
        content: Buffer.from('png'),
      });
      expect(files().getById).toHaveBeenCalledWith('tenant-1', 'logo-1');
    });

    it('has nothing to serve without a logo', async () => {
      repo.findById.mockResolvedValue(makeTenant({ logoFileId: null }));

      await expect(service.logo('tenant-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(files().getById).not.toHaveBeenCalled();
    });

    // Sin permiso de archivos, solo puede salir una imagen.
    it('never serves a file that is not an image', async () => {
      repo.findById.mockResolvedValue(makeTenant({ logoFileId: 'logo-1' }));
      files().getById.mockResolvedValue({
        id: 'logo-1',
        mimeType: 'application/pdf',
      });

      await expect(service.logo('tenant-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(files().getFileBuffer).not.toHaveBeenCalled();
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
