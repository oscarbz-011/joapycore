import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { TenantModulesService } from './tenant-modules.service';

function makeModule(name: string, active = true) {
  return { id: `mod-${name}`, tenantId: 'tenant-1', moduleName: name, active, activatedAt: null };
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
      repo.findAllForTenant.mockResolvedValue([makeModule('inventory')]);
      service.list('tenant-1');
      expect(repo.findAllForTenant).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── setActive ──────────────────────────────────────────────────────────────

  describe('setActive', () => {
    it('throws BadRequestException for unknown module name', async () => {
      repo.findAllForTenant.mockResolvedValue([]);
      await expect(service.setActive('tenant-1', 'nonexistent', true)).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.setActive).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when module is not configured for tenant', async () => {
      // sales has no inactive deps when inventory is active
      repo.findAllForTenant.mockResolvedValue([makeModule('inventory', true), makeModule('sales', false)]);
      repo.setActive.mockResolvedValue(0);
      await expect(service.setActive('tenant-1', 'sales', true)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws UnprocessableEntityException when activating a module with inactive dependencies', async () => {
      // inventory is inactive — sales cannot be activated
      repo.findAllForTenant.mockResolvedValue([makeModule('inventory', false), makeModule('sales', false)]);
      await expect(service.setActive('tenant-1', 'sales', true)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repo.setActive).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when deactivating a module that others depend on', async () => {
      // sales is active and billing depends on it
      repo.findAllForTenant.mockResolvedValue([
        makeModule('inventory', true),
        makeModule('sales', true),
        makeModule('billing', true),
      ]);
      await expect(service.setActive('tenant-1', 'sales', false)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repo.setActive).not.toHaveBeenCalled();
    });

    it('activates a module when its dependencies are active', async () => {
      const allModules = [makeModule('inventory', true), makeModule('sales', false)];
      repo.findAllForTenant
        .mockResolvedValueOnce(allModules)            // called in setActive for dep check
        .mockResolvedValueOnce([...allModules, makeModule('sales', true)]); // final list
      repo.setActive.mockResolvedValue(1);

      const result = await service.setActive('tenant-1', 'sales', true);

      expect(repo.setActive).toHaveBeenCalledWith('tenant-1', 'sales', true);
      expect(result).toBeDefined();
    });

    it('deactivates a module without dependents', async () => {
      // hr has no dependencies and no module depends on it by default
      repo.findAllForTenant
        .mockResolvedValueOnce([makeModule('hr', true)])
        .mockResolvedValueOnce([makeModule('hr', false)]);
      repo.setActive.mockResolvedValue(1);

      await service.setActive('tenant-1', 'hr', false);

      expect(repo.setActive).toHaveBeenCalledWith('tenant-1', 'hr', false);
    });
  });
});
