import type { FrontModuleManifest } from '../types';

export const financeManifest: FrontModuleManifest = {
  id: 'finance',
  module: 'finance',
  settingsHref: '/dashboard/settings/credit',
  nav: [
    {
      section: 'creditos-cobranzas',
      label: 'Evaluación de crédito',
      href: '/dashboard/billing/approvals',
    },
    { section: 'creditos-cobranzas', label: 'Financiamiento', href: '/dashboard/finance' },
  ],
  routes: [
    { prefix: '/dashboard/billing/approvals', anyPermission: ['sales:credit:evaluate'] },
    { prefix: '/dashboard/finance', anyPermission: ['finance:read'] },
  ],
};
