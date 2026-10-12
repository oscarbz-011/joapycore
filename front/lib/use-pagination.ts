import { useState } from 'react';
import { DEFAULT_PAGE_SIZE, paginate } from './pagination';

/**
 * Página actual de una lista ya filtrada y ordenada. Devuelve las filas a
 * mostrar y lo que necesita <TablePagination>. Si la lista se achica (por un
 * filtro o una búsqueda), se muestra la última página que todavía existe.
 */
export function usePagination<T>(
  rows: readonly T[],
  initialPageSize: number = DEFAULT_PAGE_SIZE,
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const view = paginate(rows, page, pageSize);

  return {
    items: view.items,
    controls: {
      page: view.page,
      pageCount: view.pageCount,
      pageSize: view.pageSize,
      total: view.total,
      from: view.from,
      to: view.to,
      onPage: setPage,
      onPageSize: (size: number) => {
        setPageSize(size);
        setPage(1);
      },
    },
  };
}

export type PaginationControls = ReturnType<typeof usePagination>['controls'];
