import { Truck } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

export const procurementManifest: FrontModuleManifest = {
  id: 'procurement',
  module: 'procurement',
  sections: [{ id: 'procurement', label: 'Compras', icon: Truck, order: 40 }],
  nav: [
    { section: 'procurement', label: 'Órdenes de compra', href: '/dashboard/procurement' },
    {
      section: 'procurement',
      label: 'Comparar proveedores',
      href: '/dashboard/procurement/compare-prices',
    },
    { section: 'procurement', label: 'Proveedores', href: '/dashboard/procurement/suppliers' },
    { section: 'procurement', label: 'Devolución de compra', href: '#', stub: true },
    { section: 'tesoreria', label: 'Cuentas por pagar', href: '/dashboard/procurement/payables' },
  ],
  routes: [
    { prefix: '/dashboard/procurement', anyPermission: ['procurement:read'] },
    { prefix: '/dashboard/procurement/suppliers', anyPermission: ['suppliers:read'] },
    {
      prefix: '/dashboard/procurement/payables',
      anyPermission: ['procurement:payables:read'],
    },
  ],
};
