import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantModulesService } from './tenant-modules.service';

function makeModule(name: string, isActive = true) {
  return { id: `mod-${name}`, tenantId: 'tenant-1', moduleName: name, isActive };
}

describe('TenantModulesService', () => {
  let service: TenantModulesService;
  let repo: { findAllForTenant: jest.Mock; setActive: jest.Mock };

  beforeEach(() => {
    repo = { findAllForTenant: jest.fn(), setActive: jest.fn() };
    service = new TenantModulesService(repo as any);
  });

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('delegates to repository', () => {
      repo.findAllForTenant.mockResolvedValue([makeModule('sales')]);
      service.list('tenant-1');
      expect(repo.findAllForTenant).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── setActive ──────────────────────────────────────────────────────────────

  describe('setActive', () => {
    it('throws BadRequestException for unknown module name', async () => {
      await expect(service.setActive('tenant-1', 'nonexistent', true)).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.setActive).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when module is not configured for tenant', async () => {
      repo.setActive.mockResolvedValue(0);
      await expect(service.setActive('tenant-1', 'sales', false)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('activates a known module and returns updated list', async () => {
      const updated = [makeModule('sales', true)];
      repo.setActive.mockResolvedValue(1);
      repo.findAllForTenant.mockResolvedValue(updated);

      const result = await service.setActive('tenant-1', 'sales', true);

      expect(repo.setActive).toHaveBeenCalledWith('tenant-1', 'sales', true);
      expect(result).toEqual(updated);
    });

    it('deactivates a known module', async () => {
      repo.setActive.mockResolvedValue(1);
      repo.findAllForTenant.mockResolvedValue([makeModule('hr', false)]);

      await service.setActive('tenant-1', 'hr', false);

      expect(repo.setActive).toHaveBeenCalledWith('tenant-1', 'hr', false);
    });
  });
});
