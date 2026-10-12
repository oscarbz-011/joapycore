import { useEffect, useState } from 'react';
import {
  DEFAULT_PAGE_SIZE,
  listQuery,
  serverPage,
  type ListQuery,
} from './pagination';
import { nextSort, type SortState } from './table-sort';
import type { PaginationControls } from './use-pagination';

const SEARCH_DELAY_MS = 350;

/**
 * Estado de una lista que el servidor busca, ordena y pagina: página, filas
 * por página, columna de orden y texto buscado. `query` es lo que se le manda
 * a la API (va en la clave de la consulta); la búsqueda se manda recién cuando
 * se deja de tipear. Cambiar la búsqueda o el orden vuelve a la página 1.
 */
export function useServerList<K extends string>(
  initialPageSize: number = DEFAULT_PAGE_SIZE,
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sort, setSort] = useState<SortState<K> | null>(null);
  const [search, setSearchText] = useState('');
  const [settledSearch, setSettledSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSettledSearch(search), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const query: ListQuery = listQuery({
    page,
    pageSize,
    search: settledSearch,
    sort,
  });

  return {
    query,
    search,
    /** Hay una búsqueda tipeada que todavía no se mandó. */
    searching: search !== settledSearch,
    setSearch: (text: string) => {
      setSearchText(text);
      setPage(1);
    },
    sort,
    toggleSort: (key: K) => {
      setSort((current) => nextSort(current, key));
      setPage(1);
    },
    /** Vuelve a la primera página (al cambiar un filtro propio de la pantalla). */
    resetPage: () => setPage(1),
    /** Lo que necesita <TablePagination>, con el total que devolvió la API. */
    controls: (total: number | undefined): PaginationControls => ({
      ...serverPage(page, pageSize, total),
      onPage: setPage,
      onPageSize: (size: number) => {
        setPageSize(size);
        setPage(1);
      },
    }),
  };
}
