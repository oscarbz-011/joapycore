import { Users } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

export const hrManifest: FrontModuleManifest = {
  id: 'hr',
  module: 'hr',
  sections: [{ id: 'hr', label: 'RRHH', icon: Users, order: 120 }],
  nav: [
    { section: 'hr', label: 'Empleados', href: '/dashboard/hr' },
    { section: 'hr', label: 'Departamentos', href: '/dashboard/hr/areas' },
    { section: 'hr', label: 'Roles', href: '#', stub: true },
    { section: 'hr', label: 'Asistencia', href: '#', stub: true },
    { section: 'hr', label: 'Vacaciones', href: '/dashboard/hr/leaves' },
    { section: 'hr', label: 'Nómina de sueldos', href: '/dashboard/hr/payroll' },
    { section: 'hr', label: 'Reclutamiento', href: '#', stub: true },
  ],
  routes: [
    {
      prefix: '/dashboard/hr',
      anyPermission: ['hr:read', 'hr:employees:create', 'hr:leaves:manage'],
    },
    { prefix: '/dashboard/hr/payroll', anyPermission: ['hr:payroll:run'] },
    { prefix: '/dashboard/hr/new', anyPermission: ['hr:employees:create'] },
  ],
};
