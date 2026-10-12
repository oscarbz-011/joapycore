'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { PAGE_SIZES, needsPagination, pageSummary } from '@/lib/pagination';
import type { PaginationControls } from '@/lib/use-pagination';
import { cn } from '@/lib/utils';

/**
 * Pie de una lista paginada: qué filas se ven, cuántas por página y los
 * botones para moverse. No aparece si la lista entra en la página más chica.
 */
export function TablePagination({
  page,
  pageCount,
  pageSize,
  total,
  from,
  to,
  onPage,
  onPageSize,
  label = 'registros',
  className,
}: PaginationControls & {
  /** Qué se está listando, en plural: "clientes", "órdenes". */
  label?: string;
  className?: string;
}) {
  if (!needsPagination(total)) return null;

  const first = page <= 1;
  const last = page >= pageCount;

  return (
    <nav
      aria-label={`Paginación de ${label}`}
      className={cn(
        'mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-muted-foreground',
        className,
      )}
    >
      <p aria-live="polite">{pageSummary({ from, to, total }, label)}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span id={`page-size-${label}`}>Filas por página</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSize(Number(value))}
          >
            <SelectTrigger className="h-8 w-20" aria-labelledby={`page-size-${label}`}>
              <span className="flex-1 text-left text-sm text-foreground">{pageSize}</span>
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Primera página"
            disabled={first}
            onClick={() => onPage(1)}
          >
            <ChevronsLeft size={15} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Página anterior"
            disabled={first}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft size={15} />
          </Button>
          <span className="px-2 tabular-nums text-foreground">
            Página {page} de {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Página siguiente"
            disabled={last}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight size={15} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Última página"
            disabled={last}
            onClick={() => onPage(pageCount)}
          >
            <ChevronsRight size={15} />
          </Button>
        </div>
      </div>
    </nav>
  );
}
