import { lazy } from 'react';
import { Route } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

export const logisticsManifest: FrontModuleManifest = {
  id: 'logistics',
  module: 'logistics',
  sections: [{ id: 'logistics', label: 'Logística', icon: Route, order: 110 }],
  nav: [
    { section: 'logistics', label: 'Entregas', href: '/dashboard/logistics/deliveries' },
    { section: 'logistics', label: 'Rutas de entrega', href: '/dashboard/logistics/routes' },
    { section: 'logistics', label: 'Mis entregas', href: '/dashboard/logistics/mine' },
    ...['Entrada', 'Salida', 'Almacenamiento', 'Transporte'].map((label) => ({
      section: 'logistics',
      label,
      href: '#',
      stub: true,
    })),
    { section: 'logistics', label: 'Depósitos', href: '/dashboard/settings/warehouses' },
  ],
  // Con Logística activa, la entrega del pedido la maneja Logística.
  slots: {
    'sale-order.delivery': lazy(() =>
      import('@/components/logistics/order-delivery').then((m) => ({
        default: m.LogisticsOrderDelivery,
      })),
    ),
  },
  routes: [
    { prefix: '/dashboard/logistics', anyPermission: ['logistics:read', 'logistics:manage'] },
    { prefix: '/dashboard/logistics/mine', anyPermission: ['logistics:track'] },
  ],
};
