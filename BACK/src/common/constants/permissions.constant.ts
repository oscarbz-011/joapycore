export const PERMISSIONS = [
  'tenants:read',
  'tenants:update',
  'tenants:modules:manage',
  'users:read',
  'users:create',
  'users:update',
  'users:deactivate',
  'roles:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
