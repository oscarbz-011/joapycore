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
