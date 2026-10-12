// Lo que antes era el menú "Finanzas" del sidebar son ahora cinco entradas de
// primer nivel: Facturas, Créditos y Cobranzas, Tesorería, Contabilidad y
// Reportes. Facturas y Reportes son un enlace directo; las otras tres se
// despliegan.

export interface FinanceNavItem {
  label: string;
  href: string;
  permission?: string;
  module?: string;
  /** Todavía sin pantalla: se muestra apagado. */
  stub?: boolean;
}

export interface FinanceNavGroup {
  id: string;
  label: string;
  items: FinanceNavItem[];
  /** Enlace directo, sin desplegable. */
  flat?: boolean;
  /** Se muestra si la empresa tiene alguno de estos módulos. */
  modules?: string[];
  /** Se muestra si la persona tiene alguno de estos permisos. */
  anyPermission?: string[];
}

export const FINANCE_NAV_GROUPS: FinanceNavGroup[] = [
  {
    id: 'facturas',
    label: 'Facturas',
    flat: true,
    modules: ['billing'],
    anyPermission: ['billing:read'],
    items: [
      {
        label: 'Facturas',
        href: '/dashboard/billing',
        permission: 'billing:read',
        module: 'billing',
      },
    ],
  },
  {
    id: 'creditos-cobranzas',
    label: 'Créditos y Cobranzas',
    modules: ['finance', 'payments', 'collections'],
    anyPermission: [
      'sales:credit:evaluate',
      'finance:read',
      'payments:read',
      'collections:read',
    ],
    items: [
      {
        label: 'Evaluación de crédito',
        href: '/dashboard/billing/approvals',
        permission: 'sales:credit:evaluate',
        module: 'finance',
      },
      {
        label: 'Financiamiento',
        href: '/dashboard/finance',
        permission: 'finance:read',
        module: 'finance',
      },
      {
        label: 'Cuentas por cobrar',
        href: '/dashboard/payments',
        permission: 'payments:read',
        module: 'payments',
      },
      {
        label: 'Cobranzas',
        href: '/dashboard/cobranzas',
        permission: 'collections:read',
        module: 'collections',
      },
    ],
  },
  {
    id: 'tesoreria',
    label: 'Tesorería',
    // Hoy lo único que existe acá es Cuentas por pagar: sin ese acceso no
    // tiene sentido mostrar una entrada con todo apagado.
    modules: ['procurement'],
    anyPermission: ['procurement:payables:read'],
    items: [
      { label: 'Caja', href: '#', stub: true },
      { label: 'Bancos', href: '#', stub: true },
      {
        label: 'Cuentas por pagar',
        href: '/dashboard/procurement/payables',
        permission: 'procurement:payables:read',
        module: 'procurement',
      },
    ],
  },
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    // Todavía sin pantallas: la ve quien ya veía el área financiera.
    modules: ['billing', 'payments', 'finance', 'collections', 'procurement'],
    anyPermission: [
      'billing:read',
      'payments:read',
      'finance:read',
      'collections:read',
      'procurement:payables:read',
    ],
    items: [
      { label: 'Contabilidad', href: '#', stub: true },
      { label: 'Impuestos', href: '#', stub: true },
      { label: 'Presupuesto', href: '#', stub: true },
    ],
  },
  {
    id: 'reportes',
    label: 'Reportes',
    flat: true,
    anyPermission: ['reports:read'],
    items: [
      {
        label: 'Reportes',
        href: '/dashboard/settings/reports',
        permission: 'reports:read',
      },
    ],
  },
];
