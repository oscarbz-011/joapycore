'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Layers, ChartBarStacked } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { key: 'documents', label: 'Documentos', href: '/dashboard/documents', icon: FileText },
  { key: 'templates', label: 'Plantillas', href: '/dashboard/documents/templates', icon: Layers },
  { key: 'categories', label: 'Categorías', href: '/dashboard/documents/categories', icon: ChartBarStacked },
] as const;

export function DocumentsNav() {
  const pathname = usePathname();

  return (
    <div className="mb-5 flex border-b border-border">
      {ITEMS.map(({ key, label, href, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={key}
            href={href}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={14} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
