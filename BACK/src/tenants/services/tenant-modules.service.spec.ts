import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TenantModulesService } from './tenant-modules.service';

function makeModule(name: string, active = true) {
  return {
    id: `mod-${name}`,
    tenantId: 'tenant-1',
    moduleName: name,
    active,
    activatedAt: null,
  };
}

describe('TenantModulesService', () => {
  let service: TenantModulesService;
  let repo: {
    findAllForTenant: jest.Mock;
    setActive: jest.Mock;
    backfillMissing: jest.Mock;
  };
  let cache: { invalidate: jest.Mock; getActiveModules: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    repo = {
      findAllForTenant: jest.fn(),
      setActive: jest.fn(),
      backfillMissing: jest.fn().mockResolvedValue(undefined),
    };
    cache = { invalidate: jest.fn(), getActiveModules: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    service = new TenantModulesService(
      repo as any,
      cache as any,
      eventEmitter as any,
    );
  });

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('delegates to repository', async () => {
      repo.findAllForTenant.mockResolvedValue([makeModule('inventory')]);
      await service.list('tenant-1');
      expect(repo.findAllForTenant).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── setActive ──────────────────────────────────────────────────────────────

  describe('setActive', () => {
    it('throws BadRequestException for unknown module name', async () => {
      repo.findAllForTenant.mockResolvedValue([]);
      await expect(
        service.setActive('tenant-1', 'nonexistent', true),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.setActive).not.toHaveBeenCalled();
    });

    it('backfills missing module rows before activating, so a module without a row can be turned on', async () => {
      // sales has no inactive deps when inventory is active
      repo.findAllForTenant.mockResolvedValue([
        makeModule('inventory', true),
        makeModule('sales', false),
      ]);
      const order: string[] = [];
      repo.backfillMissing.mockImplementation(() => {
        order.push('backfill');
        return Promise.resolve();
      });
      repo.setActive.mockImplementation(() => {
        order.push('setActive');
        return Promise.resolve(1);
      });

      await service.setActive('tenant-1', 'sales', true);

      expect(order).toEqual(['backfill', 'setActive']);
    });

    it('throws UnprocessableEntityException when activating a module with inactive dependencies', async () => {
      // inventory is inactive — sales cannot be activated
      repo.findAllForTenant.mockResolvedValue([
        makeModule('inventory', false),
        makeModule('sales', false),
      ]);
      await expect(
        service.setActive('tenant-1', 'sales', true),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repo.setActive).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when deactivating a module that others depend on', async () => {
      // sales is active and billing depends on it
      repo.findAllForTenant.mockResolvedValue([
        makeModule('inventory', true),
        makeModule('sales', true),
        makeModule('billing', true),
      ]);
      await expect(
        service.setActive('tenant-1', 'sales', false),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repo.setActive).not.toHaveBeenCalled();
    });

    it('activates a module when its dependencies are active', async () => {
      const allModules = [
        makeModule('inventory', true),
        makeModule('sales', false),
      ];
      repo.findAllForTenant
        .mockResolvedValueOnce(allModules) // called in setActive for dep check
        .mockResolvedValueOnce([...allModules, makeModule('sales', true)]); // final list
      repo.setActive.mockResolvedValue(1);

      const result = await service.setActive('tenant-1', 'sales', true);

      expect(repo.setActive).toHaveBeenCalledWith('tenant-1', 'sales', true);
      expect(result).toBeDefined();
    });

    it('emits tenant.module.activated when a module transitions from inactive to active', async () => {
      const allModules = [
        makeModule('inventory', true),
        makeModule('documents', false),
      ];
      repo.findAllForTenant
        .mockResolvedValueOnce(allModules)
        .mockResolvedValueOnce([...allModules, makeModule('documents', true)]);
      repo.setActive.mockResolvedValue(1);

      await service.setActive('tenant-1', 'documents', true);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'tenant.module.activated',
        {
          tenantId: 'tenant-1',
          moduleName: 'documents',
        },
      );
    });

    // Sin esto, activar un módulo no tenía efecto hasta re-loguearse: el
    // guard leía `activeModules` del JWT, que es una foto del login.
    it.each([true, false])(
      'invalidates the modules cache when setting active=%s',
      async (active) => {
        const allModules = [
          makeModule('inventory', true),
          makeModule('documents', !active),
        ];
        repo.findAllForTenant.mockResolvedValue(allModules);
        repo.setActive.mockResolvedValue(1);

        await service.setActive('tenant-1', 'documents', active);

        expect(cache.invalidate).toHaveBeenCalledWith('tenant-1');
      },
    );

    it('does not re-emit tenant.module.activated when the module was already active', async () => {
      const allModules = [
        makeModule('inventory', true),
        makeModule('documents', true),
      ];
      repo.findAllForTenant
        .mockResolvedValueOnce(allModules)
        .mockResolvedValueOnce(allModules);
      repo.setActive.mockResolvedValue(1);

      await service.setActive('tenant-1', 'documents', true);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
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
