import { Package, Puzzle } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { ModuleCatalog, TenantModuleResponse } from './api/tenants';
import { catalogByKey, catalogSections, moduleIcon, type ModuleStatusFilter } from './module-catalog';

const CATALOG: ModuleCatalog = {
  categories: ['Inventario y Productos', 'Ventas y CRM', 'Finanzas y Contabilidad'],
  modules: [
    { key: 'inventory', displayName: 'Inventario', description: 'Stock y almacenes', icon: 'Package', category: 'Inventario y Productos', dependencies: [], isStable: true },
    { key: 'sales', displayName: 'Ventas', description: 'Pedidos y clientes', icon: 'ShoppingCart', category: 'Ventas y CRM', dependencies: ['inventory'], isStable: true },
    { key: 'crm', displayName: 'CRM', description: 'Leads y campañas', icon: 'Network', category: 'Ventas y CRM', dependencies: ['sales'], isStable: false },
    { key: 'billing', displayName: 'Facturación', description: 'Emisión de facturas', icon: 'FileText', category: 'Finanzas y Contabilidad', dependencies: ['sales'], isStable: true, bundledWith: 'sales' },
  ],
  roadmap: [
    { displayName: 'Multi-moneda', description: 'Cobros en más de una moneda', icon: 'Coins', category: 'Finanzas y Contabilidad' },
    { displayName: 'Pagos Online', description: 'Pasarela de pago', icon: 'Globe', category: 'Integraciones' },
  ],
};

const mod = (moduleName: string, active: boolean): TenantModuleResponse => ({
  id: moduleName,
  tenantId: 't1',
  moduleName,
  active,
  activatedAt: null,
});
const TENANT = [mod('inventory', true), mod('sales', true), mod('crm', false), mod('billing', true)];

const sectionsFor = (search: string, status: ModuleStatusFilter = 'all') =>
  catalogSections({ catalog: CATALOG, tenantModules: TENANT, search, status }).map((s) => [
    s.category,
    s.modules.map((m) => m.moduleName),
    s.roadmap.map((r) => r.displayName),
  ]);

describe('catálogo de módulos', () => {
  it('groups modules and roadmap entries in the backend category order', () => {
    expect(sectionsFor('')).toEqual([
      ['Inventario y Productos', ['inventory'], []],
      ['Ventas y CRM', ['crm', 'sales'], []],
      ['Finanzas y Contabilidad', ['billing'], ['Multi-moneda']],
      ['Integraciones', [], ['Pagos Online']],
    ]);
  });

  it('filters by status, leaving the roadmap out of active and inactive', () => {
    expect(sectionsFor('', 'inactive')).toEqual([['Ventas y CRM', ['crm'], []]]);
    expect(sectionsFor('', 'planned')).toEqual([
      ['Finanzas y Contabilidad', [], ['Multi-moneda']],
      ['Integraciones', [], ['Pagos Online']],
    ]);
  });

  it('searches names and descriptions ignoring accents and case', () => {
    expect(sectionsFor('facturacion')).toEqual([['Finanzas y Contabilidad', ['billing'], []]]);
    expect(sectionsFor('CAMPAÑAS')).toEqual([['Ventas y CRM', ['crm'], []]]);
    expect(sectionsFor('nada parecido')).toEqual([]);
  });

  it('ignores modules the catalog does not know', () => {
    const sections = catalogSections({
      catalog: CATALOG,
      tenantModules: [mod('retired', true)],
      search: '',
      status: 'active',
    });
    expect(sections).toEqual([]);
  });

  it('adds the settings screen each front module declares', () => {
    const byKey = catalogByKey(CATALOG);
    expect(byKey.sales.settingsHref).toBe('/dashboard/settings/combos');
    expect(byKey.billing.settingsHref).toBe('/dashboard/settings/billing-series');
    expect(byKey.inventory.settingsHref).toBeUndefined();
  });

  it('falls back to a generic icon for a name it does not know', () => {
    expect(moduleIcon('Package')).toBe(Package);
    expect(moduleIcon('NoExiste')).toBe(Puzzle);
  });
});
