export const DEFAULT_ACTIVE_MODULES = [
  'sales',
  'inventory',
  'billing',
  'payments',
  'procurement',
];

export const DEFAULT_INACTIVE_MODULES = ['hr'];

export const ALL_TENANT_MODULES = [
  ...DEFAULT_ACTIVE_MODULES,
  ...DEFAULT_INACTIVE_MODULES,
];
