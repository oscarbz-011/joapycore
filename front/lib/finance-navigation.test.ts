import { describe, expect, it } from 'vitest';
import { FINANCE_NAV_ITEMS, groupBySection } from './finance-navigation';

describe('finance menu', () => {
  // La distribución que pidió el dueño del producto el 2026-10-07.
  it('is laid out in the approved sections and order', () => {
    expect(
      groupBySection(FINANCE_NAV_ITEMS).map((section) => [
        section.title,
        section.items.map((item) => item.label),
      ]),
    ).toEqual([
      [null, ['Facturas']],
      [
        'Créditos y Cobranzas',
        ['Evaluación de crédito', 'Financiamiento', 'Cuentas por cobrar', 'Cobranzas'],
      ],
      ['Tesorería', ['Caja', 'Bancos', 'Cuentas por pagar']],
      ['Contabilidad', ['Contabilidad', 'Impuestos', 'Presupuesto']],
      [null, ['Reportes']],
    ]);
  });

  it('keeps every screen that exists reachable at its address', () => {
    const links = Object.fromEntries(
      FINANCE_NAV_ITEMS.filter((item) => !item.stub).map((item) => [item.label, item.href]),
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

  it('shows the screens that do not exist yet as switched off', () => {
    expect(
      FINANCE_NAV_ITEMS.filter((item) => item.stub).map((item) => item.label),
    ).toEqual(['Caja', 'Bancos', 'Contabilidad', 'Impuestos', 'Presupuesto']);
  });
});

describe('groupBySection', () => {
  const item = (label: string, section?: string) => ({ label, section });

  it('groups consecutive items under their section', () => {
    expect(
      groupBySection([item('a'), item('b', 'X'), item('c', 'X'), item('d')]),
    ).toEqual([
      { title: null, items: [item('a')] },
      { title: 'X', items: [item('b', 'X'), item('c', 'X')] },
      { title: null, items: [item('d')] },
    ]);
  });

  // Quien no tiene permiso para nada de una sección no ve ni su título.
  it('leaves out a section with nothing left in it', () => {
    const visible = [item('a'), item('d')];
    expect(groupBySection(visible).map((s) => s.title)).toEqual([null]);
  });

  it('returns nothing for an empty menu', () => {
    expect(groupBySection([])).toEqual([]);
  });
});
