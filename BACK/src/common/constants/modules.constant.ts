export interface ModuleDefinition {
  displayName: string;
  description: string;
  icon: string;
  /** Keys of modules that must be active before this one can be activated. */
  dependencies: string[];
  /** false = visible en el catálogo pero marcado como "Próximamente / Beta". */
  isStable: boolean;
}

export const MODULE_CATALOG: Record<string, ModuleDefinition> = {
  inventory: {
    displayName: 'Inventario',
    description: 'Gestión de productos, stock y movimientos de almacén',
    icon: 'Package',
    dependencies: [],
    isStable: true,
  },
  sales: {
    displayName: 'Ventas',
    description: 'Pedidos, presupuestos y gestión de clientes',
    icon: 'ShoppingCart',
    dependencies: ['inventory'],
    isStable: true,
  },
  billing: {
    displayName: 'Facturación',
    description: 'Emisión y administración de facturas',
    icon: 'FileText',
    dependencies: ['sales'],
    isStable: true,
  },
  payments: {
    displayName: 'Pagos',
    description: 'Cuentas por cobrar y registros de pago',
    icon: 'CreditCard',
    dependencies: ['billing'],
    isStable: true,
  },
  procurement: {
    displayName: 'Compras',
    description: 'Órdenes de compra y gestión de proveedores',
    icon: 'Truck',
    dependencies: ['inventory'],
    isStable: true,
  },
  hr: {
    displayName: 'Recursos Humanos',
    description: 'Empleados, licencias y procesamiento de nómina',
    icon: 'Users',
    dependencies: [],
    isStable: true,
  },
  finance: {
    displayName: 'Finanzas',
    description: 'Créditos, planes de cuotas e installments',
    icon: 'Banknote',
    dependencies: ['sales', 'billing'],
    isStable: false,
  },
  collections: {
    displayName: 'Cobranzas',
    description: 'Asignación de cobradores y gestión de mora',
    icon: 'ClipboardList',
    dependencies: ['finance'],
    isStable: false,
  },
  pos: {
    displayName: 'Punto de Venta',
    description: 'Venta rápida con código de barras y caja',
    icon: 'Monitor',
    dependencies: ['sales', 'inventory', 'billing'],
    isStable: false,
  },
} as const;

export const ALL_TENANT_MODULES = Object.keys(MODULE_CATALOG);

/**
 * Módulos activos por defecto al registrarse según el rubro.
 * Solo se usan como template de onboarding — el tenant puede
 * activar/desactivar cualquier módulo del catálogo después.
 */
export const MODULE_TEMPLATES: Record<string, string[]> = {
  electrodomesticos: [
    'inventory',
    'sales',
    'billing',
    'payments',
    'procurement',
    'hr',
  ],
  ferreteria: ['inventory', 'sales', 'billing', 'payments', 'procurement'],
  supermercado: ['inventory', 'sales', 'billing', 'payments', 'pos'],
  servicios: ['sales', 'billing', 'payments', 'hr'],
  default: ['inventory', 'sales', 'billing', 'payments'],
};
