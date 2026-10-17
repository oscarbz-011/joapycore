import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanySwitcher, JoapyCoreBrand } from '@/app/(dashboard)/dashboard/components/company-switcher';

const state = vi.hoisted(() => ({ brand: undefined as unknown, queryKeys: [] as { key: unknown[]; enabled: boolean }[] }));

beforeEach(() => {
  state.brand = { id: 'tenant-1', name: 'Ferro', razonSocial: 'Ferro S.A.', ruc: '80012345-6', hasLogo: false };
  state.queryKeys = [];
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => undefined }) }));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ jwtPayload: { sub: 'me', tenantId: 'tenant-1', tenantName: 'Ferro S.A.', permissions: [], activeModules: [] } }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled?: boolean }) => {
    state.queryKeys.push({ key: queryKey, enabled: enabled !== false });
    return { data: queryKey[1] === 'brand' ? state.brand : undefined };
  },
}));

const switcher = () => renderToStaticMarkup(createElement(CompanySwitcher));

describe('the top of the sidebar', () => {
  it('shows the brand of the ERP', () => {
    expect(renderToStaticMarkup(createElement(JoapyCoreBrand))).toContain('JoapyCore');
  });

  it('shows the company in use with its RUC, and lets open the list of companies', () => {
    const html = switcher();

    expect(html).toContain('Empresa');
    expect(html).toContain('Ferro');
    expect(html).toContain('RUC 80012345-6');
    expect(html).toContain('aria-label="Empresa: Ferro. Cambiar de empresa"');
  });

  it('shows the initials when the company has no logo, without asking for it', () => {
    const html = switcher();

    expect(html).toContain('>F<');
    expect(state.queryKeys.find((query) => query.key[1] === 'logo')?.enabled).toBe(false);
  });

  it('asks for the logo when the company has one', () => {
    state.brand = { id: 'tenant-1', name: 'Ferro', razonSocial: null, ruc: null, hasLogo: true };

    switcher();

    expect(state.queryKeys).toContainEqual({ key: ['tenant', 'logo', 'tenant-1'], enabled: true });
  });

  // Mientras carga, ya se sabe en qué empresa se está por la sesión.
  it('shows the name of the session while the company loads', () => {
    state.brand = undefined;

    expect(switcher()).toContain('Ferro S.A.');
  });
});
