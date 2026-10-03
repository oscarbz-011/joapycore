import { describe, expect, it } from 'vitest';
import { nextSort, sortRows } from './table-sort';

interface Row {
  id: string;
  name: string | null;
  total: number;
  date: string;
}

const rows: Row[] = [
  { id: 'a', name: 'Óscar', total: 10, date: '2026-09-19' },
  { id: 'b', name: 'alberto', total: 2, date: '2026-10-02' },
  { id: 'c', name: null, total: 2, date: '2026-04-02' },
  { id: 'd', name: 'Marcos 10', total: 300, date: '2026-08-01' },
  { id: 'e', name: 'Marcos 9', total: 2, date: '2026-08-01' },
];

const accessors = {
  name: (row: Row) => row.name,
  total: (row: Row) => row.total,
  date: (row: Row) => new Date(row.date),
};

const ids = (list: Row[]) => list.map((row) => row.id);

describe('sortRows', () => {
  it('sorts text ignoring case and accents, with numbers in natural order', () => {
    expect(
      ids(sortRows(rows, { key: 'name', direction: 'asc' }, accessors)),
    ).toEqual(['b', 'e', 'd', 'a', 'c']);
  });

  it('keeps empty values last in both directions', () => {
    expect(
      ids(sortRows(rows, { key: 'name', direction: 'desc' }, accessors)),
    ).toEqual(['a', 'd', 'e', 'b', 'c']);
  });

  it('sorts numbers and keeps ties in their original order', () => {
    expect(
      ids(sortRows(rows, { key: 'total', direction: 'asc' }, accessors)),
    ).toEqual(['b', 'c', 'e', 'a', 'd']);
    expect(
      ids(sortRows(rows, { key: 'total', direction: 'desc' }, accessors)),
    ).toEqual(['d', 'a', 'b', 'c', 'e']);
  });

  it('sorts dates', () => {
    expect(
      ids(sortRows(rows, { key: 'date', direction: 'desc' }, accessors)),
    ).toEqual(['b', 'a', 'd', 'e', 'c']);
  });

  it('uses the default order of the table when no column is selected', () => {
    expect(
      ids(sortRows(rows, null, accessors, (x, y) => y.total - x.total)),
    ).toEqual(['d', 'a', 'b', 'c', 'e']);
    expect(ids(sortRows(rows, null, accessors))).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('does not change the original list', () => {
    sortRows(rows, { key: 'total', direction: 'asc' }, accessors);
    expect(ids(rows)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('nextSort', () => {
  it('cycles ascending, descending and back to the default order', () => {
    const asc = nextSort(null, 'total');
    expect(asc).toEqual({ key: 'total', direction: 'asc' });
    const desc = nextSort(asc, 'total');
    expect(desc).toEqual({ key: 'total', direction: 'desc' });
    expect(nextSort(desc, 'total')).toBeNull();
  });

  it('starts ascending when another column is clicked', () => {
    expect(nextSort({ key: 'total', direction: 'desc' }, 'name')).toEqual({
      key: 'name',
      direction: 'asc',
    });
  });
});
