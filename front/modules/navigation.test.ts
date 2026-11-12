import { describe, expect, it } from 'vitest';
import { PERMISSION_GROUPS } from '@/lib/permissions';
import { buildNavigation } from './navigation';
import { FRONT_MODULES } from './registry';

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
const ALL_MODULES = FRONT_MODULES.flatMap((m) => (m.module ? [m.module] : []));

const labels = (modules: string[], permissions: string[]) =>
  buildNavigation(modules, permissions).map((g) => g.label);
const itemsOf = (label: string, modules: string[], permissions: string[]) =>
  buildNavigation(modules, permissions)
    .find((g) => g.label === label)
    ?.items.map((i) => i.label);

describe('menú generado desde los manifiestos', () => {
  it('keeps the approved layout for someone who can see everything', () => {
    const nav = buildNavigation(ALL_MODULES, ALL_PERMISSIONS);
    expect(nav.filter((g) => !g.bottom).map((g) => g.label)).toEqual([
      'Aplicaciones',
      'Inventario',
      'Ventas',
      'Compras',
      'Producción',
      'Facturas',
      'Créditos y Cobranzas',
      'Tesorería',
      'Contabilidad',
      'Reportes',
      'Logística',
      'RRHH',
      'CRM',
      'Proyectos',
      'POS',
      'Activos Fijos',
      'Documentos',
    ]);
    expect(nav.filter((g) => g.bottom).map((g) => g.label)).toEqual([
      'Empresa',
      'Membresía',
      'Soporte',
      'Sistema',
    ]);
  });

  // La distribución que pidió el dueño del producto el 2026-10-07.
  it('splits the financial area into five first-level entries', () => {
    const nav = buildNavigation(ALL_MODULES, ALL_PERMISSIONS);
    const financial = ['Facturas', 'Créditos y Cobranzas', 'Tesorería', 'Contabilidad', 'Reportes'];
    expect(
      nav
        .filter((g) => financial.includes(g.label))
        .map((g) => [g.label, g.items.map((i) => i.label), !!g.flat]),
    ).toEqual([
      ['Facturas', ['Facturas'], true],
      [
        'Créditos y Cobranzas',
        ['Evaluación de crédito', 'Financiamiento', 'Cuentas por cobrar', 'Cobranzas'],
        false,
      ],
      ['Tesorería', ['Caja', 'Bancos', 'Cuentas por pagar'], false],
      ['Contabilidad', ['Contabilidad', 'Impuestos', 'Presupuesto'], false],
      ['Reportes', ['Reportes'], true],
    ]);
  });

  it('keeps the inventory screens and their nested pages active', () => {
    const inventory = buildNavigation(ALL_MODULES, ALL_PERMISSIONS).find(
      (g) => g.id === 'inventory',
    );
    expect(inventory?.items.map((i) => i.label)).toEqual([
      'Productos',
      'Categorías',
      'Marcas',
      'Movimientos',
      'Lotes',
      'Carga inicial',
      'Stock',
    ]);
    expect(inventory?.matchPrefix).toBe(true);
  });

  it('hides a switched-off module, also from sections it shares', () => {
    expect(labels(['inventory', 'sales'], ALL_PERMISSIONS)).not.toContain('Facturas');
    expect(
      itemsOf('Créditos y Cobranzas', ['sales', 'billing', 'payments'], ALL_PERMISSIONS),
    ).toEqual(['Cuentas por cobrar']);
  });

  it('only offers the screens the person can open', () => {
    expect(itemsOf('Ventas', ['sales'], ['sales:read'])).toEqual([
      'Órdenes de venta',
      'Metas',
      'Devoluciones',
    ]);
    expect(labels(['sales'], ['customers:read'])).toContain('Ventas');
    expect(labels(['sales'], [])).not.toContain('Ventas');
  });

  it('does not show a section made only of switched-off entries', () => {
    expect(labels(['procurement'], ['procurement:read'])).not.toContain('Tesorería');
    expect(itemsOf('Tesorería', ['procurement'], ['procurement:payables:read'])).toEqual([
      'Caja',
      'Bancos',
      'Cuentas por pagar',
    ]);
  });

  it('does not show treasury to someone who only sees invoices', () => {
    expect(labels(['billing'], ['billing:read'])).not.toContain('Tesorería');
    expect(labels(['billing', 'procurement'], ['billing:read'])).not.toContain('Tesorería');
  });

  it('shows the announced modules only when they are active', () => {
    expect(labels([], [])).not.toContain('CRM');
    expect(labels(['crm'], [])).toContain('CRM');
  });

  it('shows accounting to whoever already sees the financial area', () => {
    expect(labels(['billing'], [])).not.toContain('Contabilidad');
    expect(labels([], ['billing:read'])).not.toContain('Contabilidad');
    expect(labels(['billing'], ['billing:read'])).toContain('Contabilidad');
  });

  it('lists warehouses under Logistics only when Logistics is active', () => {
    expect(itemsOf('Empresa', [], ['warehouses:read'])).toEqual(['Depósitos']);
    expect(labels([], ['warehouses:read'])).not.toContain('Logística');
    expect(itemsOf('Logística', ['logistics'], ['warehouses:read'])).toEqual([
      'Entrada',
      'Salida',
      'Almacenamiento',
      'Transporte',
      'Depósitos',
    ]);
  });

  it('asks for the right permission on the settings root links', () => {
    expect(itemsOf('Sistema', [], ['users:read'])).toEqual(['Gestión de usuarios']);
    expect(itemsOf('Sistema', [], ['tenants:update'])).toEqual(['Configuración']);
    expect(itemsOf('Sistema', [], ['integrations:read'])).toEqual(['Integraciones']);
  });
});

describe('manifiestos del front', () => {
  it('declare each module and each section once', () => {
    const modules = FRONT_MODULES.flatMap((m) => (m.module ? [m.module] : []));
    expect(new Set(modules).size).toBe(modules.length);
    const sections = FRONT_MODULES.flatMap((m) => m.sections ?? []).map((s) => s.id);
    expect(new Set(sections).size).toBe(sections.length);
  });

  it('only put entries in sections that exist', () => {
    const sections = new Set(
      FRONT_MODULES.flatMap((m) => m.sections ?? []).map((s) => s.id),
    );
    const orphans = FRONT_MODULES.flatMap((m) => m.nav ?? []).filter(
      (entry) => !sections.has(entry.section),
    );
    expect(orphans).toEqual([]);
  });

  it('only reference permissions that exist in the catalog', () => {
    const catalog = new Set(ALL_PERMISSIONS);
    const unknown = FRONT_MODULES.flatMap((m) => m.nav ?? [])
      .flatMap((entry) => entry.anyPermission ?? [])
      .filter((p) => !catalog.has(p));
    expect(unknown).toEqual([]);
  });
});
