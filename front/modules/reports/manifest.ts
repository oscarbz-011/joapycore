import { ChartColumn } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

export const reportsManifest: FrontModuleManifest = {
  id: 'reports',
  sections: [{ id: 'reportes', label: 'Reportes', icon: ChartColumn, order: 100, flat: true }],
  nav: [{ section: 'reportes', label: 'Reportes', href: '/dashboard/settings/reports' }],
  routes: [{ prefix: '/dashboard/settings/reports', anyPermission: ['reports:read'] }],
};
