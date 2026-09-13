'use client';

import Link from 'next/link';
import { CalendarDays, LayoutGrid, Receipt, Users2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type HrSection = 'employees' | 'areas' | 'leaves' | 'payroll';

const LINKS = [
  { key: 'employees', label: 'Empleados', href: '/dashboard/hr', icon: Users2 },
  { key: 'areas', label: 'Áreas y cargos', href: '/dashboard/hr/areas', icon: LayoutGrid },
  { key: 'leaves', label: 'Licencias', href: '/dashboard/hr/leaves', icon: CalendarDays },
  { key: 'payroll', label: 'Nómina', href: '/dashboard/hr/payroll', icon: Receipt },
] as const;

// Pestañas de RRHH, compartidas por todas sus pantallas (antes cada página
// tenía su propia copia).
export function HrNav({ active }: { active: HrSection }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {LINKS.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            active === key
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon size={15} />
          {label}
        </Link>
      ))}
    </div>
  );
}
