import { Package } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

export const inventoryManifest: FrontModuleManifest = {
  id: 'inventory',
  module: 'inventory',
  sections: [
    { id: 'inventory', label: 'Inventario', icon: Package, order: 20, matchPrefix: true },
  ],
  nav: [
    { section: 'inventory', label: 'Productos', href: '/dashboard/inventory/products' },
    { section: 'inventory', label: 'Categorías', href: '/dashboard/inventory/categories' },
    { section: 'inventory', label: 'Marcas', href: '/dashboard/inventory/brands' },
    { section: 'inventory', label: 'Movimientos', href: '/dashboard/inventory/movements' },
    { section: 'inventory', label: 'Lotes', href: '/dashboard/inventory/batches' },
    {
      section: 'inventory',
      label: 'Carga inicial',
      href: '/dashboard/inventory/stock-entries/initial',
    },
    { section: 'inventory', label: 'Stock', href: '/dashboard/inventory/stock' },
  ],
  routes: [
    {
      prefix: '/dashboard/inventory',
      anyPermission: [
        'inventory:products:read',
        'inventory:categories:read',
        'inventory:brands:read',
        'inventory:movements:read',
      ],
    },
    { prefix: '/dashboard/inventory/products', anyPermission: ['inventory:products:read'] },
    { prefix: '/dashboard/inventory/stock', anyPermission: ['inventory:products:read'] },
    { prefix: '/dashboard/inventory/categories', anyPermission: ['inventory:categories:read'] },
    { prefix: '/dashboard/inventory/config', anyPermission: ['inventory:categories:read'] },
    { prefix: '/dashboard/inventory/brands', anyPermission: ['inventory:brands:read'] },
    { prefix: '/dashboard/inventory/movements', anyPermission: ['inventory:movements:read'] },
    { prefix: '/dashboard/inventory/batches', anyPermission: ['inventory:products:read'] },
    {
      prefix: '/dashboard/inventory/stock-entries',
      anyPermission: ['inventory:movements:create'],
    },
  ],
};
