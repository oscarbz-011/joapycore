// Convención para agregar permisos nuevos (principio de mínimo privilegio —
// con muchos módulos y submódulos creciendo, hace falta poder dar acceso a
// una sección sin dar acceso a todo el módulo):
//
// - `<módulo>:<acción>` sigue siendo válido cuando el módulo no tiene
//   submódulos separables (patrón actual de la mayoría).
// - `<módulo>:<submódulo>:<acción>` es el patrón preferido de acá en
//   adelante cuando un módulo tiene secciones que algunos roles deberían
//   poder ver/gestionar independientemente unas de otras — mismo criterio
//   que ya siguen HR (`hr:payroll:run` vs `hr:employees:create`) y POS
//   (`pos:session:open` vs `pos:terminals:manage`).
// - Preferir verbos específicos (create, update, delete, issue, cancel,
//   receive, run, pay, terminate, open, close) sobre un `manage` genérico
//   cuando las acciones son realmente distintas; `manage` se mantiene
//   aceptable como catch-all de escritura cuando no hace falta esa
//   distinción.
//
// Cada permiso nuevo acá también necesita su entrada en
// `front/lib/permissions.ts` (PERMISSION_GROUPS) para que sea asignable
// desde la UI de Roles/Usuarios — si no aparece ahí, existe en el backend
// pero ningún admin puede otorgarlo.
export const PERMISSIONS = [
  // Tenants
  'tenants:read',
  'tenants:update',
  'tenants:modules:manage',
  // Users & Roles
  'users:read',
  'users:create',
  'users:update',
  'users:deactivate',
  'roles:manage',
  // Inventory
  'inventory:products:read',
  'inventory:products:create',
  'inventory:products:update',
  'inventory:products:delete',
  'inventory:categories:read',
  'inventory:categories:manage',
  'inventory:brands:read',
  'inventory:brands:manage',
  'inventory:movements:read',
  'inventory:movements:create',
  // Customers & Suppliers
  'customers:read',
  'customers:create',
  'customers:update',
  'suppliers:read',
  'suppliers:create',
  'suppliers:update',
  // Producción (rubros que fabrican lo que venden — ver ProductKind)
  'production:recipes:read',
  'production:recipes:manage',
  'production:orders:read',
  'production:orders:manage',
  // Procurement
  'procurement:read',
  'procurement:create',
  'procurement:update',
  'procurement:receive',
  'procurement:payables:read',
  'procurement:payables:register',
  // Sales
  'sales:read',
  'sales:create',
  'sales:update',
  'sales:cancel',
  'sales:manage',
  'sales:credit:evaluate',
  'sales:combos:read',
  'sales:combos:manage',
  'sales:quotes:read',
  'sales:quotes:manage',
  // Billing
  'billing:read',
  'billing:issue',
  'billing:cancel',
  // Payments
  'payments:read',
  'payments:register',
  // Branches
  'branches:read',
  'branches:manage',
  // Warehouses
  'warehouses:read',
  'warehouses:manage',
  // Audit
  'audit:read',
  // Alerts
  'alerts:read',
  'alerts:manage',
  // Files
  'files:upload',
  'files:read',
  'files:delete',
  // Documents (read/manage = documentos comunes; categorías y plantillas
  // separadas — ver documents.service.ts para el porqué de la asignación en
  // el service en vez del controller para create/update/delete/file/email)
  'documents:read',
  'documents:manage',
  'documents:categories:read',
  'documents:categories:manage',
  'documents:templates:read',
  'documents:templates:manage',
  // Finance
  'finance:read',
  'finance:installments:pay',
  'finance:payments:apply',
  'finance:advance:manage',
  // Logistics
  'logistics:read',
  'logistics:manage',
  'logistics:assign',
  'logistics:track',
  // Collections
  'collections:read',
  'collections:manage',
  'collections:collect',
  // Reports
  'reports:read',
  // SIFEN (Facturación Electrónica)
  'sifen:read',
  'sifen:manage',
  // HR
  'hr:read',
  'hr:employees:create',
  'hr:employees:update',
  'hr:employees:terminate',
  'hr:leaves:manage',
  'hr:payroll:run',
  'hr:payroll:pay',
  'hr:config:manage',
  // Point of Sale (POS)
  'pos:terminals:manage',
  'pos:session:open',
  'pos:session:close',
  'pos:session:manage',
  'pos:sell',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
