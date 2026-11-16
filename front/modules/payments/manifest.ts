import type { FrontModuleManifest } from '../types';

export const paymentsManifest: FrontModuleManifest = {
  id: 'payments',
  module: 'payments',
  nav: [
    { section: 'creditos-cobranzas', label: 'Cuentas por cobrar', href: '/dashboard/payments' },
  ],
  routes: [{ prefix: '/dashboard/payments', anyPermission: ['payments:read'] }],
};
