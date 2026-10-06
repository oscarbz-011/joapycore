import { useMemo, useState } from 'react';
import {
  nextSort,
  sortRows,
  type SortState,
  type SortValue,
} from './table-sort';

/**
 * Estado de orden de una tabla. `accessors` y `fallback` tienen que ser
 * estables (definidos fuera del componente) para no reordenar en cada render.
 */
export function useTableSort<T, K extends string>(
  rows: readonly T[],
  accessors: Record<K, (row: T) => SortValue>,
  fallback?: (a: T, b: T) => number,
) {
  const [sort, setSort] = useState<SortState<K> | null>(null);
  const sorted = useMemo(
    () => sortRows(rows, sort, accessors, fallback),
    [rows, sort, accessors, fallback],
  );
  return {
    sorted,
    sort,
    toggle: (key: K) => setSort((current) => nextSort(current, key)),
  };
}
