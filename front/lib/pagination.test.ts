import { describe, expect, it } from 'vitest';
import { needsPagination, pageSummary, paginate } from './pagination';

const rows = Array.from({ length: 143 }, (_, index) => index + 1);

describe('paginate', () => {
  it('shows the first page', () => {
    const page = paginate(rows, 1, 25);

    expect(page.items).toEqual(rows.slice(0, 25));
    expect(page).toMatchObject({
      page: 1,
      pageCount: 6,
      pageSize: 25,
      total: 143,
      from: 1,
      to: 25,
    });
  });

  it('shows a shorter last page', () => {
    const page = paginate(rows, 6, 25);

    expect(page.items).toEqual(rows.slice(125));
    expect(page).toMatchObject({ from: 126, to: 143 });
  });

  // Se filtra la lista estando en la página 6 y quedan 30 filas.
  it('falls back to the last page that still exists', () => {
    const page = paginate(rows.slice(0, 30), 6, 25);

    expect(page.page).toBe(2);
    expect(page.items).toEqual(rows.slice(25, 30));
  });

  it('never goes before the first page', () => {
    expect(paginate(rows, 0, 25).page).toBe(1);
    expect(paginate(rows, -3, 25).page).toBe(1);
    expect(paginate(rows, Number.NaN, 25).page).toBe(1);
  });

  it('handles an empty list', () => {
    expect(paginate([], 1, 25)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      pageSize: 25,
      total: 0,
      from: 0,
      to: 0,
    });
  });

  it('fits everything in one page when the list is short', () => {
    const page = paginate([1, 2, 3], 1, 25);

    expect(page.items).toEqual([1, 2, 3]);
    expect(page.pageCount).toBe(1);
  });
});

describe('pageSummary', () => {
  it('says which rows are on screen', () => {
    expect(pageSummary(paginate(rows, 2, 25), 'clientes')).toBe(
      'Mostrando 26–50 de 143 clientes',
    );
  });

  it('formats large totals', () => {
    expect(pageSummary({ from: 1, to: 25, total: 12_480 }, 'movimientos')).toBe(
      'Mostrando 1–25 de 12.480 movimientos',
    );
  });

  it('says when there is nothing', () => {
    expect(pageSummary(paginate([], 1, 25), 'clientes')).toBe('Sin clientes');
  });
});

describe('needsPagination', () => {
  it('leaves short lists alone', () => {
    expect(needsPagination(10)).toBe(false);
    expect(needsPagination(11)).toBe(true);
  });
});
