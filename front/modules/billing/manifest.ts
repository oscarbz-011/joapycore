import { ReceiptText } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

export const billingManifest: FrontModuleManifest = {
  id: 'billing',
  module: 'billing',
  settingsHref: '/dashboard/settings/billing-series',
  sections: [{ id: 'facturas', label: 'Facturas', icon: ReceiptText, order: 60, flat: true }],
  nav: [{ section: 'facturas', label: 'Facturas', href: '/dashboard/billing' }],
  routes: [
    { prefix: '/dashboard/billing', anyPermission: ['billing:read', 'billing:issue'] },
    { prefix: '/dashboard/settings/billing-series', anyPermission: ['billing:read'] },
  ],
};
