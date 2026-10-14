import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SalesTargetsPage from '@/app/(dashboard)/dashboard/sales/targets/page';

const state = vi.hoisted(() => ({
  permissions: ['sales:read'] as string[],
  fails: false,
  perf: null as unknown,
}));

const seller = (id: string, firstName: string, actual: number, target: number | null) => ({
  seller: { id, firstName, lastName: 'Test' },
  actual,
  target,
  cashAmount: actual,
  creditAmount: 0,
  cashCount: 1,
  creditCount: 0,
});
const MANAGER = {
  period: '2026-10',
  companyActual: 40_930_000,
  companyTarget: 80_000_000,
  canManage: true,
  sellers: [{ ...seller('ana', 'Ana', 30_400_000, 25_000_000), cashAmount: 7_700_000, creditAmount: 22_700_000, cashCount: 2, creditCount: 3 }, seller('luis', 'Luis', 9_550_000, 20_000_000), seller('carla', 'Carla', 980_000, null)],
};

beforeEach(() => {
  state.permissions = ['sales:read', 'sales:manage'];
  state.fails = false;
  state.perf = MANAGER;
});

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ jwtPayload: { sub: 'me', tenantId: 'tenant-1', permissions: state.permissions, activeModules: ['sales'] } }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    isPending: false,
    error: state.fails && queryKey[0] === 'sales-performance' ? new Error('Unavailable') : null,
    data: queryKey[0] === 'sales-performance' ? (state.fails ? undefined : state.perf) : [],
    refetch: () => Promise.resolve(),
  }),
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  useMutation: () => ({ error: null, isPending: false, mutate: () => undefined }),
}));

const page = () => renderToStaticMarkup(createElement(SalesTargetsPage));

describe('Metas, for a manager', () => {
  it('puts what the company sold against its goal, with the percentage and what is missing', () => {
    const html = page();

    expect(html).toContain('Ventas de la empresa');
    expect(html).toContain('Gs. 40.930.000');
    expect(html).toContain('Gs. 80.000.000');
    expect(html).toContain('51%');
    expect(html).toContain('Falta para la meta');
    expect(html).toContain('Gs. 39.070.000');
  });

  it('makes the company goal as visible as what was sold', () => {
    const html = page();

    expect(html).toMatch(/<dt[^>]*>Meta de la empresa<\/dt>/);
    expect(html).toMatch(/<span class="[^"]*text-3xl[^"]*">Gs\. 80\.000\.000<\/span>/);
  });

  it('tells how many sales of each seller were cash and how many on credit', () => {
    const html = page();

    expect(html).toContain('Ventas contado');
    expect(html).toContain('Ventas crédito');
    const ana = html.slice(html.indexOf('Ana Test'), html.indexOf('</tr>', html.indexOf('Ana Test')));
    expect(ana).toMatch(/Gs\. 7\.700\.000<\/td><td[^>]*>2<\/td><td[^>]*>Gs\. 22\.700\.000<\/td><td[^>]*>3<\/td>/);
  });

  // Antes se mostraba "100 %" y "Faltan Gs. 0".
  it('shows by how much a seller beat the goal', () => {
    const html = page();

    expect(html).toContain('122%');
    expect(html).toContain('+Gs. 5.400.000');
    expect(html).toContain('Meta cumplida');
  });

  it('lists every seller, the ones without a goal too, with a way to set it', () => {
    const html = page();

    expect(html).toContain('Carla Test');
    expect(html).toContain('aria-label="Definir la meta"');
    expect(html).toContain('aria-label="Cambiar la meta"');
  });

  it('does not offer to change goals without permission to manage them', () => {
    state.permissions = ['sales:read'];

    const html = page();

    expect(html).not.toContain('aria-label="Cambiar la meta"');
    expect(html).not.toContain('Agregar meta');
  });

  it('offers a retry when the goals fail to load', () => {
    state.fails = true;

    const html = page();

    expect(html).toContain('role="alert"');
    expect(html).toMatch(/<button[^>]*>Reintentar<\/button>/);
  });
});

describe('Metas, for a seller', () => {
  it('shows only their own sales against their goal', () => {
    state.permissions = ['sales:read'];
    state.perf = { ...MANAGER, canManage: false, companyTarget: null, sellers: [seller('luis', 'Luis', 9_550_000, 20_000_000)] };

    const html = page();

    expect(html).toContain('Tus ventas');
    expect(html).toMatch(/<dt[^>]*>Tu meta<\/dt>/);
    expect(html).toContain('48%');
    expect(html).not.toContain('Ventas de la empresa');
    expect(html).not.toContain('aria-label="Vendedores"');
  });

  it('says so when they have not sold anything yet', () => {
    state.permissions = ['sales:read'];
    state.perf = { ...MANAGER, canManage: false, sellers: [] };

    expect(page()).toContain('Todavía no tenés ventas en este mes.');
  });
});
