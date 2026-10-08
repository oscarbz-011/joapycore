import { describe, expect, it } from 'vitest';
import { FINANCE_NAV_GROUPS } from './finance-navigation';

describe('finance entries of the sidebar', () => {
  // La distribución que pidió el dueño del producto el 2026-10-07: cada una
  // es una entrada de primer nivel, no un submenú de "Finanzas".
  it('are five first-level entries, in the approved order', () => {
    expect(
      FINANCE_NAV_GROUPS.map((group) => [
        group.label,
        group.items.map((item) => item.label),
      ]),
    ).toEqual([
      ['Facturas', ['Facturas']],
      [
        'Créditos y Cobranzas',
        ['Evaluación de crédito', 'Financiamiento', 'Cuentas por cobrar', 'Cobranzas'],
      ],
      ['Tesorería', ['Caja', 'Bancos', 'Cuentas por pagar']],
      ['Contabilidad', ['Contabilidad', 'Impuestos', 'Presupuesto']],
      ['Reportes', ['Reportes']],
    ]);
  });

  it('open Facturas and Reportes directly, without a dropdown', () => {
    expect(
      FINANCE_NAV_GROUPS.filter((group) => group.flat).map((group) => group.label),
    ).toEqual(['Facturas', 'Reportes']);
    for (const group of FINANCE_NAV_GROUPS.filter((g) => g.flat)) {
      expect(group.items).toHaveLength(1);
    }
  });

  it('keep every screen that exists reachable at its address', () => {
    const links = Object.fromEntries(
      FINANCE_NAV_GROUPS.flatMap((group) => group.items)
        .filter((item) => !item.stub)
        .map((item) => [item.label, item.href]),
    );
    expect(links).toEqual({
      Facturas: '/dashboard/billing',
      'Evaluación de crédito': '/dashboard/billing/approvals',
      Financiamiento: '/dashboard/finance',
      'Cuentas por cobrar': '/dashboard/payments',
      Cobranzas: '/dashboard/cobranzas',
      'Cuentas por pagar': '/dashboard/procurement/payables',
      Reportes: '/dashboard/settings/reports',
    });
  });

  it('show the screens that do not exist yet as switched off', () => {
    expect(
      FINANCE_NAV_GROUPS.flatMap((group) => group.items)
        .filter((item) => item.stub)
        .map((item) => item.label),
    ).toEqual(['Caja', 'Bancos', 'Contabilidad', 'Impuestos', 'Presupuesto']);
  });

  // Una entrada se ofrece solo a quien puede abrir algo de ella.
  it('ask for a permission that one of their own screens needs', () => {
    for (const group of FINANCE_NAV_GROUPS) {
      const needed = group.items.flatMap((item) => item.permission ?? []);
      if (needed.length === 0) continue;
      expect(group.anyPermission).toEqual(expect.arrayContaining(needed));
    }
  });

  it('have unique ids', () => {
    const ids = FINANCE_NAV_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
