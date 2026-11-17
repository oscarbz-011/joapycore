import { TenantContext } from './tenant-context';

describe('TenantContext', () => {
  it('has no tenant outside a context', () => {
    expect(TenantContext.get()).toBeUndefined();
  });

  it('runs a job as the given tenant', async () => {
    const seen = await TenantContext.run('t1', () =>
      Promise.resolve(TenantContext.get()),
    );
    expect(seen).toBe('t1');
    expect(TenantContext.get()).toBeUndefined();
  });

  it('lets authentication fill a request context', () => {
    const seen = TenantContext.runRequest(() => {
      expect(TenantContext.get()).toBeUndefined();
      TenantContext.set('t1');
      return TenantContext.get();
    });
    expect(seen).toBe('t1');
  });

  it('refuses to set a tenant without a context', () => {
    expect(() => TenantContext.set('t1')).toThrow('No hay un contexto');
  });

  it('refuses to switch a context to another tenant', () => {
    TenantContext.runRequest(() => {
      TenantContext.set('t1');
      expect(() => TenantContext.set('t1')).not.toThrow();
      expect(() => TenantContext.set('t2')).toThrow('otra empresa');
    });
  });

  it('keeps concurrent jobs apart', async () => {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 5));
    const results = await Promise.all(
      ['t1', 't2', 't3'].map((tenantId) =>
        TenantContext.run(tenantId, async () => {
          await wait();
          return TenantContext.get();
        }),
      ),
    );
    expect(results).toEqual(['t1', 't2', 't3']);
  });
});
