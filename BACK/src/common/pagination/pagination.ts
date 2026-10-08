// Paginación de listas en el servidor. Cada lista paginada recibe un filtro
// que extiende BaseFilterDto (page, limit, q, sortBy, sortDir) y devuelve una
// página con el total, para que la pantalla no tenga que traer todo.

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;

export interface Paginated<T> {
  items: T[];
  /** Registros que cumplen el filtro, en todas las páginas. */
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PageWindow {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

const whole = (value: unknown, fallback: number) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
};

/** Qué tramo de la lista pide la consulta, ya acotado a límites sanos. */
export function pageWindow(query: {
  page?: number;
  limit?: number;
}): PageWindow {
  const page = whole(query.page, 1);
  const limit = Math.min(
    whole(query.limit, DEFAULT_PAGE_LIMIT),
    MAX_PAGE_LIMIT,
  );
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function paginated<T>(
  items: T[],
  total: number,
  window: Pick<PageWindow, 'page' | 'limit'>,
): Paginated<T> {
  return {
    items,
    total,
    page: window.page,
    limit: window.limit,
    totalPages: Math.max(1, Math.ceil(total / window.limit)),
  };
}

/**
 * Orden pedido por la pantalla, traducido al de la consulta. Solo se aceptan
 * las columnas declaradas: un `sortBy` desconocido no llega nunca a la base y
 * se usa el orden por defecto.
 */
export function orderByFrom<Order>(
  query: { sortBy?: string; sortDir?: 'asc' | 'desc' },
  columns: Record<string, (direction: 'asc' | 'desc') => Order>,
  fallback: Order,
): Order {
  const column = query.sortBy ? columns[query.sortBy] : undefined;
  if (
    !column ||
    !Object.prototype.hasOwnProperty.call(columns, query.sortBy!)
  ) {
    return fallback;
  }
  return column(query.sortDir === 'desc' ? 'desc' : 'asc');
}

/** Palabras de una búsqueda de texto libre; vacío si no se buscó nada. */
export function searchWords(q: string | undefined, max = 6): string[] {
  return (q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, max);
}

/**
 * Una palabra buscada y su versión sin acentos, para que "benítez" también
 * encuentre "Benitez". La base compara sin distinguir mayúsculas pero sí
 * acentos: esto cubre el caso de tipear el acento que el dato no tiene. El
 * inverso (tipear sin acento un dato que sí lo tiene) no queda cubierto.
 */
export function accentVariants(word: string): string[] {
  const plain = word.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return plain === word ? [word] : [word, plain];
}
