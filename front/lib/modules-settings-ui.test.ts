import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModulesPage from '@/app/(dashboard)/dashboard/settings/modules/page';

const state = vi.hoisted(() => ({ catalogFails: false }));

beforeEach(() => {
  state.catalogFails = false;
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => undefined }) }));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    jwtPayload: { permissions: ['tenants:modules:manage'] },
    refreshSession: () => Promise.resolve(),
  }),
}));

const CATALOG = {
  categories: ['Ventas y CRM', 'Finanzas y Contabilidad', 'Integraciones'],
  modules: [
    { key: 'sales', displayName: 'Ventas', description: 'Pedidos y clientes', icon: 'ShoppingCart', category: 'Ventas y CRM', dependencies: [], isStable: true },
    { key: 'crm', displayName: 'CRM', description: 'Leads y campañas', icon: 'Network', category: 'Ventas y CRM', dependencies: ['sales'], isStable: false },
    { key: 'billing', displayName: 'Facturación', description: 'Emisión de facturas', icon: 'FileText', category: 'Finanzas y Contabilidad', dependencies: ['sales'], isStable: true, bundledWith: 'sales' },
  ],
  roadmap: [
    { displayName: 'WhatsApp Business', description: 'Mensajes automáticos', icon: 'MessageCircle', category: 'Integraciones' },
  ],
};
const MODULES = [
  { id: '1', tenantId: 't', moduleName: 'sales', active: true, activatedAt: null },
  { id: '2', tenantId: 't', moduleName: 'crm', active: false, activatedAt: null },
  { id: '3', tenantId: 't', moduleName: 'billing', active: true, activatedAt: null },
];

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'module-catalog') {
      return state.catalogFails
        ? { isPending: false, isError: true, error: new Error('down'), data: undefined, refetch: () => undefined }
        : { isPending: false, isError: false, error: null, data: CATALOG, refetch: () => undefined };
    }
    return { isLoading: false, data: MODULES };
  },
  useQueryClient: () => ({ setQueryData: () => undefined }),
  useMutation: () => ({ isError: false, isPending: false, mutate: () => undefined }),
}));

const page = () => renderToStaticMarkup(createElement(ModulesPage));

describe('Ajustes → Módulos', () => {
  it('shows the catalog the backend sends, grouped by its categories', () => {
    const html = page();
    expect(html.indexOf('Ventas y CRM')).toBeLessThan(html.indexOf('Finanzas y Contabilidad'));
    expect(html.indexOf('Finanzas y Contabilidad')).toBeLessThan(html.indexOf('Integraciones'));
    expect(html).toContain('Leads y campañas');
    expect(html).toContain('WhatsApp Business');
    expect(html).toContain('Próximamente');
  });

  it('locks a module until its dependencies are active and shows bundled ones without a switch', () => {
    const html = page();
    expect(html).toContain('aria-label="Activar CRM"');
    expect(html).toContain('Incluido con Ventas');
    expect(html).not.toContain('Desactivar Facturación');
  });

  it('links the settings screen of active modules that have one', () => {
    const html = page();
    expect(html).toContain('title="Configurar Ventas"');
    expect(html).toContain('title="Configurar Facturación"');
    expect(html).not.toContain('title="Configurar CRM"');
  });

  it('says so when the catalog cannot be loaded', () => {
    state.catalogFails = true;
    const html = page();
    expect(html).toContain('No se pudo cargar el catálogo de módulos');
    expect(html).toContain('Reintentar');
  });
});
