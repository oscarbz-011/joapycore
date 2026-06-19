import { Industry } from '@prisma/client';

export const ALL_TENANT_MODULES = [
  'sales',
  'inventory',
  'billing',
  'payments',
  'procurement',
  'hr',
];

// Modules active by default per industry. All others are seeded as inactive.
export const ACTIVE_MODULES_BY_INDUSTRY: Record<Industry, string[]> = {
  electrodomesticos: ALL_TENANT_MODULES, // all active
};

// Legacy defaults kept for reference — use ACTIVE_MODULES_BY_INDUSTRY instead
export const DEFAULT_ACTIVE_MODULES = ['sales', 'inventory', 'billing', 'payments', 'procurement'];
export const DEFAULT_INACTIVE_MODULES = ['hr'];
