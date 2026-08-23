'use client';

import { useAuth } from './auth-context';

export interface PermissionMeta {
  key: string;
  label: string;
}

export interface PermissionGroup {
  module: string;
  label: string;
  permissions: PermissionMeta[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    module: 'config',
    label: 'Configuración',
    permissions: [
      { key: 'tenants:read', label: 'Ver empresa' },
      { key: 'tenants:update', label: 'Editar empresa' },
      { key: 'tenants:modules:manage', label: 'Gestionar módulos' },
      { key: 'users:read', label: 'Ver usuarios' },
      { key: 'users:create', label: 'Crear usuarios' },
      { key: 'users:update', label: 'Editar usuarios' },
      { key: 'users:deactivate', label: 'Desactivar usuarios' },
      { key: 'roles:manage', label: 'Gestionar roles y permisos' },
    ],
  },
  {
    module: 'inventory',
    label: 'Inventario',
    permissions: [
      { key: 'inventory:products:read', label: 'Ver productos' },
      { key: 'inventory:products:create', label: 'Crear productos' },
      { key: 'inventory:products:update', label: 'Editar productos' },
      { key: 'inventory:products:delete', label: 'Eliminar productos' },
      { key: 'inventory:categories:read', label: 'Ver categorías' },
      { key: 'inventory:categories:manage', label: 'Gestionar categorías' },
      { key: 'inventory:brands:read', label: 'Ver marcas' },
      { key: 'inventory:brands:manage', label: 'Gestionar marcas' },
      { key: 'inventory:movements:read', label: 'Ver movimientos de stock' },
      { key: 'inventory:movements:create', label: 'Registrar movimientos de stock' },
    ],
  },
  {
    module: 'contacts',
    label: 'Clientes y Proveedores',
    permissions: [
      { key: 'customers:read', label: 'Ver clientes' },
      { key: 'customers:create', label: 'Crear clientes' },
      { key: 'customers:update', label: 'Editar clientes' },
      { key: 'suppliers:read', label: 'Ver proveedores' },
      { key: 'suppliers:create', label: 'Crear proveedores' },
      { key: 'suppliers:update', label: 'Editar proveedores' },
    ],
  },
  {
    module: 'procurement',
    label: 'Compras',
    permissions: [
      { key: 'procurement:read', label: 'Ver órdenes de compra' },
      { key: 'procurement:create', label: 'Crear órdenes de compra' },
      { key: 'procurement:update', label: 'Editar compras' },
      { key: 'procurement:receive', label: 'Recibir mercadería' },
    ],
  },
  {
    module: 'sales',
    label: 'Ventas',
    permissions: [
      { key: 'sales:read', label: 'Ver ventas' },
      { key: 'sales:create', label: 'Crear órdenes de venta' },
      { key: 'sales:update', label: 'Confirmar ventas' },
      { key: 'sales:cancel', label: 'Cancelar ventas' },
      { key: 'sales:manage', label: 'Gestionar metas y asignar vendedores' },
      { key: 'sales:credit:evaluate', label: 'Evaluar y aprobar créditos' },
      { key: 'sales:combos:read', label: 'Ver combos' },
      { key: 'sales:combos:manage', label: 'Gestionar combos' },
      { key: 'sales:quotes:read', label: 'Ver presupuestos' },
      { key: 'sales:quotes:manage', label: 'Crear y convertir presupuestos' },
    ],
  },
  {
    module: 'billing',
    label: 'Facturación',
    permissions: [
      { key: 'billing:read', label: 'Ver facturas' },
      { key: 'billing:issue', label: 'Emitir facturas' },
      { key: 'billing:cancel', label: 'Cancelar facturas' },
      { key: 'billing:manage', label: 'Gestionar facturación' },
    ],
  },
  {
    module: 'hr',
    label: 'RRHH',
    permissions: [
      { key: 'hr:read', label: 'Ver empleados y RRHH' },
      { key: 'hr:employees:create', label: 'Crear empleados' },
      { key: 'hr:employees:update', label: 'Editar empleados' },
      { key: 'hr:employees:terminate', label: 'Dar de baja empleados' },
      { key: 'hr:leaves:manage', label: 'Gestionar licencias' },
      { key: 'hr:payroll:run', label: 'Liquidar nómina' },
      { key: 'hr:payroll:pay', label: 'Marcar nómina como pagada' },
      { key: 'hr:config:manage', label: 'Configurar parámetros de nómina' },
    ],
  },
  {
    module: 'payments',
    label: 'Pagos',
    permissions: [
      { key: 'payments:read', label: 'Ver pagos' },
      { key: 'payments:register', label: 'Registrar pagos' },
    ],
  },
  {
    module: 'branches',
    label: 'Sucursales',
    permissions: [
      { key: 'branches:read', label: 'Ver sucursales' },
      { key: 'branches:manage', label: 'Gestionar sucursales' },
    ],
  },
  {
    module: 'warehouses',
    label: 'Depósitos',
    permissions: [
      { key: 'warehouses:read', label: 'Ver depósitos' },
      { key: 'warehouses:manage', label: 'Gestionar depósitos' },
    ],
  },
  {
    module: 'audit',
    label: 'Auditoría',
    permissions: [
      { key: 'audit:read', label: 'Ver registro de auditoría' },
    ],
  },
  {
    module: 'alerts',
    label: 'Alertas',
    permissions: [
      { key: 'alerts:read', label: 'Ver alertas' },
      { key: 'alerts:manage', label: 'Gestionar alertas' },
    ],
  },
  {
    module: 'files',
    label: 'Archivos',
    permissions: [
      { key: 'files:upload', label: 'Subir archivos' },
      { key: 'files:read', label: 'Ver archivos' },
      { key: 'files:delete', label: 'Eliminar archivos' },
    ],
  },
  {
    module: 'documents',
    label: 'Documentos',
    permissions: [
      { key: 'documents:read', label: 'Ver documentos' },
      { key: 'documents:manage', label: 'Gestionar documentos' },
      { key: 'documents:categories:read', label: 'Ver categorías de documentos' },
      { key: 'documents:categories:manage', label: 'Gestionar categorías de documentos' },
      { key: 'documents:templates:read', label: 'Ver plantillas' },
      { key: 'documents:templates:manage', label: 'Gestionar plantillas' },
    ],
  },
  {
    module: 'finance',
    label: 'Finanzas',
    permissions: [
      { key: 'finance:read', label: 'Ver préstamos y cuotas' },
      { key: 'finance:installments:pay', label: 'Cobrar una cuota específica' },
      { key: 'finance:payments:apply', label: 'Imputar pago flexible entre cuotas' },
      { key: 'finance:advance:manage', label: 'Gestionar pagos adelantados' },
    ],
  },
  {
    module: 'logistics',
    label: 'Logística',
    permissions: [
      { key: 'logistics:read', label: 'Ver remitos y entregas' },
      { key: 'logistics:manage', label: 'Gestionar remitos y entregas' },
    ],
  },
  {
    module: 'collections',
    label: 'Cobranzas',
    permissions: [
      { key: 'collections:read', label: 'Ver cobranzas' },
      { key: 'collections:manage', label: 'Gestionar cobranzas' },
      { key: 'collections:collect', label: 'Registrar visitas de cobro' },
    ],
  },
  {
    module: 'reports',
    label: 'Reportes',
    permissions: [
      { key: 'reports:read', label: 'Ver reportes' },
    ],
  },
  {
    module: 'sifen',
    label: 'Facturación Electrónica (SIFEN)',
    permissions: [
      { key: 'sifen:read', label: 'Ver configuración SIFEN' },
      { key: 'sifen:manage', label: 'Gestionar configuración SIFEN' },
    ],
  },
  {
    module: 'pos',
    label: 'Punto de Venta',
    permissions: [
      { key: 'pos:terminals:manage', label: 'Gestionar terminales' },
      { key: 'pos:session:open', label: 'Abrir caja' },
      { key: 'pos:session:close', label: 'Cerrar caja' },
      { key: 'pos:session:manage', label: 'Ver todas las sesiones de caja' },
      { key: 'pos:sell', label: 'Vender en el POS' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions);

export function getPermissionLabel(key: string): string {
  return ALL_PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}

// Gating de secciones dentro de una vista (a diferencia del sidebar, que
// solo oculta/muestra ítems de menú completos) — usados directamente para
// lógica condicional, o vía <RequirePermission> para envolver JSX.
export function usePermission(key: string): boolean {
  const { jwtPayload } = useAuth();
  return jwtPayload?.permissions.includes(key) ?? false;
}

export function useAnyPermission(keys: string[]): boolean {
  const { jwtPayload } = useAuth();
  if (!jwtPayload) return false;
  return keys.some((k) => jwtPayload.permissions.includes(k));
}
