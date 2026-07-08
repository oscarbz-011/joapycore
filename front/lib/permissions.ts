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
      { key: 'inventory:read', label: 'Ver inventario' },
      { key: 'inventory:create', label: 'Crear productos' },
      { key: 'inventory:update', label: 'Editar productos' },
      { key: 'inventory:delete', label: 'Eliminar productos' },
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
    ],
  },
  {
    module: 'billing',
    label: 'Facturación',
    permissions: [
      { key: 'billing:read', label: 'Ver facturas' },
      { key: 'billing:issue', label: 'Emitir facturas' },
      { key: 'billing:cancel', label: 'Cancelar facturas' },
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
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions);

export function getPermissionLabel(key: string): string {
  return ALL_PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}
