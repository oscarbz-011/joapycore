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
