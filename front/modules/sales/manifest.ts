import { ShoppingCart } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

export const salesManifest: FrontModuleManifest = {
  id: 'sales',
  module: 'sales',
  settingsHref: '/dashboard/settings/combos',
  sections: [{ id: 'sales', label: 'Ventas', icon: ShoppingCart, order: 30 }],
  nav: [
    { section: 'sales', label: 'Clientes', href: '/dashboard/sales/customers' },
    { section: 'sales', label: 'Órdenes de venta', href: '/dashboard/sales' },
    { section: 'sales', label: 'Presupuestos', href: '/dashboard/sales/quotes' },
    { section: 'sales', label: 'Metas', href: '/dashboard/sales/targets' },
    { section: 'sales', label: 'Devoluciones', href: '#', stub: true },
  ],
  routes: [
    { prefix: '/dashboard/sales', anyPermission: ['sales:read'] },
    { prefix: '/dashboard/sales/customers', anyPermission: ['customers:read'] },
    {
      prefix: '/dashboard/sales/quotes',
      anyPermission: ['sales:quotes:read', 'sales:quotes:manage'],
    },
    { prefix: '/dashboard/settings/combos', anyPermission: ['sales:combos:read'] },
  ],
};
