import { describe, expect, it } from 'vitest';
import {
  listQuery,
  needsPagination,
  pageSummary,
  paginate,
  serverPage,
} from './pagination';

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

describe('listQuery', () => {
  it('asks for the page and its size', () => {
    expect(listQuery({ page: 2, pageSize: 25 })).toEqual({ page: 2, limit: 25 });
  });

  it('sends the search and the sort only when there are any', () => {
    expect(
      listQuery({
        page: 1,
        pageSize: 50,
        search: '  benitez ',
        sort: { key: 'city', direction: 'desc' },
      }),
    ).toEqual({ page: 1, limit: 50, q: 'benitez', sortBy: 'city', sortDir: 'desc' });
    expect(listQuery({ page: 1, pageSize: 50, search: '   ', sort: null })).toEqual({
      page: 1,
      limit: 50,
    });
  });
});

describe('serverPage', () => {
  it('describes the rows of the page the server returned', () => {
    expect(serverPage(2, 25, 143)).toEqual({
      page: 2,
      pageCount: 6,
      pageSize: 25,
      total: 143,
      from: 26,
      to: 50,
    });
    expect(serverPage(6, 25, 143)).toMatchObject({ from: 126, to: 143 });
  });

  it('is empty until the first answer arrives', () => {
    expect(serverPage(1, 25, undefined)).toMatchObject({
      total: 0,
      from: 0,
      to: 0,
      pageCount: 1,
    });
  });

  // Se borraron registros y la página pedida ya no existe.
  it('shows the last page that exists', () => {
    expect(serverPage(9, 25, 30)).toMatchObject({ page: 2, from: 26, to: 30 });
  });
});
