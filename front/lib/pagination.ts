// Paginación de listas en pantalla. Las listas llegan completas del servidor:
// acá se muestran de a una página para que ninguna vista sea un scroll sin fin.

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export interface Page<T> {
  /** Filas de la página que se está viendo. */
  items: T[];
  /** Página actual, ya corregida si la pedida no existe. */
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  /** Posición de la primera y la última fila que se ven (1-based); 0 si no hay. */
  from: number;
  to: number;
}

/**
 * Corta la lista en la página pedida. Si esa página ya no existe (se filtró
 * la lista y quedaron menos), muestra la última que sí.
 */
export function paginate<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): Page<T> {
  const size = Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * size;
  const items = rows.slice(start, start + size);
  return {
    items,
    page: current,
    pageCount,
    pageSize: size,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + items.length,
  };
}

/** "Mostrando 26–50 de 143 clientes". */
export function pageSummary(
  page: Pick<Page<unknown>, 'from' | 'to' | 'total'>,
  label = 'registros',
): string {
  if (page.total === 0) return `Sin ${label}`;
  const total = new Intl.NumberFormat('es-PY').format(page.total);
  return `Mostrando ${page.from}–${page.to} de ${total} ${label}`;
}

/** No hace falta paginar lo que entra en la página más chica. */
export function needsPagination(total: number): boolean {
  return total > PAGE_SIZES[0];
}

// ── Listas paginadas en el servidor ─────────────────────────────────────────
// El servidor busca, ordena y cuenta; la pantalla pide de a una página.

/** Una página tal como la devuelve la API. */
export interface Paginated<T> {
  items: T[];
  /** Registros que cumplen el filtro, en todas las páginas. */
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Lo que se le pide al servidor para una página de una lista. */
export interface ListQuery {
  page: number;
  limit: number;
  q?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function listQuery(state: {
  page: number;
  pageSize: number;
  search?: string;
  sort?: { key: string; direction: 'asc' | 'desc' } | null;
}): ListQuery {
  const q = state.search?.trim();
  return {
    page: state.page,
    limit: state.pageSize,
    ...(q && { q }),
    ...(state.sort && { sortBy: state.sort.key, sortDir: state.sort.direction }),
  };
}

/**
 * Los números del pie de una lista paginada en el servidor. `total` todavía
 * desconocido (primera carga) cuenta como cero.
 */
export function serverPage(
  page: number,
  pageSize: number,
  total: number | undefined,
): Omit<Page<never>, 'items'> {
  const count = total ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const from = count === 0 ? 0 : (current - 1) * pageSize + 1;
  return {
    page: current,
    pageCount,
    pageSize,
    total: count,
    from,
    to: Math.min(current * pageSize, count),
  };
}
