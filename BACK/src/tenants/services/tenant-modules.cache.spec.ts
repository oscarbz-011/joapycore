/// <reference types="jest" />

import { TenantModulesCache } from './tenant-modules.cache';

describe('TenantModulesCache', () => {
  let cache: TenantModulesCache;
  let repo: { findActiveModuleNames: jest.Mock };

  beforeEach(() => {
    repo = {
      findActiveModuleNames: jest
        .fn()
        .mockResolvedValue(['inventory', 'sales']),
    };
    cache = new TenantModulesCache(repo as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads the active modules from the repository on a miss', async () => {
    const modules = await cache.getActiveModules('tenant-1');

    expect(modules).toEqual(['inventory', 'sales']);
    expect(repo.findActiveModuleNames).toHaveBeenCalledWith('tenant-1');
  });

  it('does not hit the database again within the TTL', async () => {
    await cache.getActiveModules('tenant-1');
    await cache.getActiveModules('tenant-1');
    await cache.getActiveModules('tenant-1');

    // El guard corre en cada request: sin caché serían 3 queries.
    expect(repo.findActiveModuleNames).toHaveBeenCalledTimes(1);
  });

  it('caches per tenant, sin mezclar', async () => {
    repo.findActiveModuleNames
      .mockResolvedValueOnce(['inventory'])
      .mockResolvedValueOnce(['sales', 'billing']);

    const a = await cache.getActiveModules('tenant-a');
    const b = await cache.getActiveModules('tenant-b');

    expect(a).toEqual(['inventory']);
    expect(b).toEqual(['sales', 'billing']);
  });

  // El caso que motivó todo esto: activar un módulo tiene que verse en el
  // request siguiente, sin re-loguearse.
  it('re-reads immediately after invalidate', async () => {
    await cache.getActiveModules('tenant-1');
    repo.findActiveModuleNames.mockResolvedValue([
      'inventory',
      'sales',
      'production',
    ]);

    cache.invalidate('tenant-1');
    const modules = await cache.getActiveModules('tenant-1');

    expect(modules).toContain('production');
    expect(repo.findActiveModuleNames).toHaveBeenCalledTimes(2);
  });

  it('invalidating one tenant does not clear the others', async () => {
    await cache.getActiveModules('tenant-a');
    await cache.getActiveModules('tenant-b');
    repo.findActiveModuleNames.mockClear();

    cache.invalidate('tenant-a');
    await cache.getActiveModules('tenant-a');
    await cache.getActiveModules('tenant-b');

    expect(repo.findActiveModuleNames).toHaveBeenCalledTimes(1);
    expect(repo.findActiveModuleNames).toHaveBeenCalledWith('tenant-a');
  });

  it('re-reads once the TTL expires', async () => {
    jest.useFakeTimers();
    await cache.getActiveModules('tenant-1');

    jest.advanceTimersByTime(31_000);
    await cache.getActiveModules('tenant-1');

    expect(repo.findActiveModuleNames).toHaveBeenCalledTimes(2);
  });
});
