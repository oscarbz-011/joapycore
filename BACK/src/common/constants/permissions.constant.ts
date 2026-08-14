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
  'inventory:read',
  'inventory:create',
  'inventory:update',
  'inventory:delete',
  // Customers & Suppliers
  'customers:read',
  'customers:create',
  'customers:update',
  'suppliers:read',
  'suppliers:create',
  'suppliers:update',
  // Procurement
  'procurement:read',
  'procurement:create',
  'procurement:update',
  'procurement:receive',
  // Sales
  'sales:read',
  'sales:create',
  'sales:update',
  'sales:cancel',
  'sales:manage',
  // Billing
  'billing:read',
  'billing:issue',
  'billing:cancel',
  'billing:manage',
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
  // Documents
  'documents:read',
  'documents:manage',
  // Finance
  'finance:read',
  'finance:manage',
  // Logistics
  'logistics:read',
  'logistics:manage',
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
] as const;

export type Permission = (typeof PERMISSIONS)[number];
