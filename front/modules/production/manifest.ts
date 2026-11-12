import { Hammer } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

// Rubros que fabrican lo que venden (carpintería, taller). Ver ProductKind.
export const productionManifest: FrontModuleManifest = {
  id: 'production',
  module: 'production',
  sections: [{ id: 'production', label: 'Producción', icon: Hammer, order: 50 }],
  nav: [
    { section: 'production', label: 'Órdenes de producción', href: '/dashboard/production' },
  ],
  routes: [
    {
      prefix: '/dashboard/production',
      anyPermission: ['production:orders:read', 'production:recipes:read'],
    },
  ],
};
