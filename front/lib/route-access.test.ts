import { describe, expect, it } from 'vitest';
import { checkRouteAccess, findRouteRule, ROUTE_RULES } from './route-access';
import { PERMISSION_GROUPS } from './permissions';

describe('findRouteRule', () => {
  it('uses the most specific prefix', () => {
    expect(findRouteRule('/dashboard/sales/quotes/abc')?.prefix).toBe('/dashboard/sales/quotes');
    expect(findRouteRule('/dashboard/sales/123')?.prefix).toBe('/dashboard/sales');
  });

  it('does not match a prefix that is only a string prefix of another segment', () => {
    // /dashboard/hrx no es parte de /dashboard/hr
    expect(findRouteRule('/dashboard/hrx')).toBeUndefined();
  });

  it('leaves the settings root and profile open', () => {
    expect(findRouteRule('/dashboard/settings')).toBeUndefined();
    expect(findRouteRule('/dashboard/settings/profile')).toBeUndefined();
    expect(findRouteRule('/dashboard')).toBeUndefined();
  });
});

describe('checkRouteAccess', () => {
  it('blocks a screen of an inactive module', () => {
    expect(checkRouteAccess('/dashboard/production', [], ['production:orders:read'])).toEqual({
      allowed: false,
      reason: 'module',
      modules: ['production'],
    });
  });

  it('blocks when no required permission is present', () => {
    expect(checkRouteAccess('/dashboard/hr/payroll', ['hr'], ['hr:read'])).toEqual({
      allowed: false,
      reason: 'permission',
    });
  });

  it('allows with any one of the listed permissions', () => {
    expect(checkRouteAccess('/dashboard/sales/quotes', ['sales'], ['sales:quotes:read']).allowed).toBe(true);
    expect(checkRouteAccess('/dashboard/logistics/mine/1', ['logistics'], ['logistics:track']).allowed).toBe(true);
  });

  it('only references permissions that exist in the catalog', () => {
    const catalog = new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)));
    const unknown = ROUTE_RULES.flatMap((r) => r.anyPermission ?? []).filter((p) => !catalog.has(p));
    expect(unknown).toEqual([]);
  });
});
