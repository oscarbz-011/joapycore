import { NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service';

function makeTenant(overrides = {}) {
  return { id: 'tenant-1', name: 'Empresa Demo', industry: 'electrodomesticos', ...overrides };
}

describe('TenantsService', () => {
  let service: TenantsService;
  let repo: { findById: jest.Mock; update: jest.Mock };

  beforeEach(() => {
    repo = { findById: jest.fn(), update: jest.fn() };
    service = new TenantsService(repo as any);
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
      await expect(service.getById('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when tenant does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update('ghost', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('updates and returns tenant when found', async () => {
      const updated = makeTenant({ name: 'Nuevo Nombre' });
      repo.findById.mockResolvedValue(makeTenant());
      repo.update.mockResolvedValue(updated);
      const result = await service.update('tenant-1', { name: 'Nuevo Nombre' });
      expect(result.name).toBe('Nuevo Nombre');
    });
  });
});
