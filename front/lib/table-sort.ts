export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string = string> {
  key: K;
  direction: SortDirection;
}

export type SortValue = string | number | boolean | Date | null | undefined;

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

const isEmpty = (value: SortValue) =>
  value === null || value === undefined || value === '';

function compareValues(a: SortValue, b: SortValue): number {
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as Date).getTime() - new Date(b as Date).getTime();
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return Number(a) - Number(b);
  }
  return collator.compare(String(a), String(b));
}

/**
 * Ordena una copia de las filas por la columna elegida. Los valores vacíos
 * van siempre al final, en cualquier dirección. Sin columna elegida se usa el
 * orden por defecto de la tabla (`fallback`) o el orden en que llegaron.
 */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K> | null,
  accessors: Record<K, (row: T) => SortValue>,
  fallback?: (a: T, b: T) => number,
): T[] {
  if (!sort) return fallback ? [...rows].sort(fallback) : [...rows];
  const read = accessors[sort.key];
  const sign = sort.direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: read(row) }))
    .sort((a, b) => {
      const aEmpty = isEmpty(a.value);
      const bEmpty = isEmpty(b.value);
      if (aEmpty || bEmpty) {
        return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1;
      }
      return sign * compareValues(a.value, b.value) || a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** Clic en una columna: ascendente → descendente → orden por defecto. */
export function nextSort<K extends string>(
  current: SortState<K> | null,
  key: K,
): SortState<K> | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}
