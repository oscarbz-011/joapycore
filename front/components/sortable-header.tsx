'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { SortState } from '@/lib/table-sort';
import { cn } from '@/lib/utils';

interface SortableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

/** Encabezado de columna que ordena la tabla: ascendente → descendente → por defecto. */
export function SortableHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
  className,
}: SortableHeaderProps<K>) {
  const direction = sort?.key === sortKey ? sort.direction : null;
  const Icon =
    direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <th
      aria-sort={
        direction === 'asc'
          ? 'ascending'
          : direction === 'desc'
            ? 'descending'
            : 'none'
      }
      className={cn(
        'px-4 py-3',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Ordenar por ${label.toLowerCase()}`}
        className={cn(
          'inline-flex items-center gap-1 rounded uppercase tracking-wider transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          align === 'right' && 'flex-row-reverse',
          direction && 'text-foreground',
        )}
      >
        {label}
        <Icon
          aria-hidden
          size={12}
          className={cn('shrink-0', !direction && 'opacity-40')}
        />
      </button>
    </th>
  );
}
