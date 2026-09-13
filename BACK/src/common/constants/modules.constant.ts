import { Industry } from '@prisma/client';

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
    displayName: 'Financiamiento',
    description: 'Créditos, planes de cuotas e installments',
    icon: 'Banknote',
    dependencies: ['sales', 'billing'],
    isStable: true,
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
  logistics: {
    displayName: 'Logística',
    description: 'Entrada, salida, almacenamiento y transporte de mercancías',
    icon: 'Route',
    dependencies: ['inventory'],
    isStable: false,
  },
  crm: {
    displayName: 'CRM',
    description: 'Gestión de contactos, leads, deals y campañas comerciales',
    icon: 'Network',
    dependencies: ['sales'],
    isStable: false,
  },
  projects: {
    displayName: 'Proyectos',
    description:
      'Gestión de proyectos, tareas, timesheet y asignación de recursos',
    icon: 'FolderKanban',
    dependencies: [],
    isStable: false,
  },
  assets: {
    displayName: 'Activos Fijos',
    description:
      'Registro, asignación y mantenimiento de activos empresariales',
    icon: 'Boxes',
    dependencies: [],
    isStable: false,
  },
  documents: {
    displayName: 'Documentos',
    description: 'Repositorio de documentos, políticas, manuales y contratos',
    icon: 'FolderOpen',
    dependencies: [],
    isStable: false,
  },
  // Para los rubros que fabrican lo que venden (carpintería, taller): recetas
  // de materiales y órdenes de producción que consumen materia prima y dan de
  // alta el producto terminado. Ver ProductKind.
  production: {
    displayName: 'Producción',
    description: 'Recetas de materiales y órdenes de producción',
    icon: 'Hammer',
    dependencies: ['inventory'],
    isStable: false,
  },
} as const;

export const ALL_TENANT_MODULES = Object.keys(MODULE_CATALOG);

/**
 * Módulos activos por defecto al registrarse según el rubro.
 * Solo se usan como template de onboarding — el tenant puede
 * activar/desactivar cualquier módulo del catálogo después.
 */
// Módulos que se activan al registrar un tenant, según su rubro. La clave pasó
// de texto libre al enum Industry junto con Tenant.industry.
export const MODULE_TEMPLATES: Record<Industry, string[]> = {
  ELECTRODOMESTICOS: [
    'inventory',
    'sales',
    'billing',
    'payments',
    'procurement',
    'finance',
    'collections',
    'hr',
  ],
  FERRETERIA: ['inventory', 'sales', 'billing', 'payments', 'procurement'],
  SUPERMERCADO: ['inventory', 'sales', 'billing', 'payments', 'pos'],
  SERVICIOS: ['sales', 'billing', 'payments', 'hr'],
  // Una carpintería fabrica lo que vende: necesita producción además de
  // compras (para la materia prima). Ver ProductKind.
  MUEBLERIA: [
    'inventory',
    'sales',
    'billing',
    'payments',
    'procurement',
    'production',
  ],
  OTRO: ['inventory', 'sales', 'billing', 'payments'],
};

// Fallback cuando el tenant no eligió rubro (industry null).
export const FALLBACK_MODULES = MODULE_TEMPLATES.OTRO;
