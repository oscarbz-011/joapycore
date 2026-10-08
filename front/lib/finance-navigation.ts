// Menú de Finanzas del sidebar. Los destinos se agrupan en secciones
// (Créditos y Cobranzas, Tesorería, Contabilidad); Facturas y Reportes quedan
// sueltos, arriba y abajo.

export interface SectionedNavItem {
  label: string;
  href: string;
  permission?: string;
  module?: string;
  /** Todavía sin pantalla: se muestra apagado. */
  stub?: boolean;
  /** Título bajo el que se agrupa; sin sección, el ítem va suelto. */
  section?: string;
  badge?: number;
}

const CREDIT = 'Créditos y Cobranzas';
const TREASURY = 'Tesorería';
const ACCOUNTING = 'Contabilidad';

export const FINANCE_NAV_ITEMS: SectionedNavItem[] = [
  {
    label: 'Facturas',
    href: '/dashboard/billing',
    permission: 'billing:read',
    module: 'billing',
  },

  {
    section: CREDIT,
    label: 'Evaluación de crédito',
    href: '/dashboard/billing/approvals',
    permission: 'sales:credit:evaluate',
    module: 'finance',
  },
  {
    section: CREDIT,
    label: 'Financiamiento',
    href: '/dashboard/finance',
    permission: 'finance:read',
    module: 'finance',
  },
  {
    section: CREDIT,
    label: 'Cuentas por cobrar',
    href: '/dashboard/payments',
    permission: 'payments:read',
    module: 'payments',
  },
  {
    section: CREDIT,
    label: 'Cobranzas',
    href: '/dashboard/cobranzas',
    permission: 'collections:read',
    module: 'collections',
  },

  { section: TREASURY, label: 'Caja', href: '#', stub: true },
  { section: TREASURY, label: 'Bancos', href: '#', stub: true },
  {
    section: TREASURY,
    label: 'Cuentas por pagar',
    href: '/dashboard/procurement/payables',
    permission: 'procurement:payables:read',
    module: 'procurement',
  },

  { section: ACCOUNTING, label: 'Contabilidad', href: '#', stub: true },
  { section: ACCOUNTING, label: 'Impuestos', href: '#', stub: true },
  { section: ACCOUNTING, label: 'Presupuesto', href: '#', stub: true },

  {
    label: 'Reportes',
    href: '/dashboard/settings/reports',
    permission: 'reports:read',
  },
];

export interface NavSection<T> {
  /** null = ítems sueltos, sin título. */
  title: string | null;
  items: T[];
}

/**
 * Agrupa ítems consecutivos de la misma sección, respetando el orden. Se le
 * pasan los ítems ya filtrados por permisos: una sección de la que no queda
 * nada visible no aparece, ni siquiera su título.
 */
export function groupBySection<T extends { section?: string }>(
  items: readonly T[],
): NavSection<T>[] {
  const sections: NavSection<T>[] = [];
  for (const item of items) {
    const title = item.section ?? null;
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.items.push(item);
    else sections.push({ title, items: [item] });
  }
  return sections;
}
