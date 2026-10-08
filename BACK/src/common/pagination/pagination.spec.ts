import {
  accentVariants,
  orderByFrom,
  pageWindow,
  paginated,
  searchWords,
} from './pagination';

describe('pageWindow', () => {
  it('defaults to the first page of 25', () => {
    expect(pageWindow({})).toEqual({ page: 1, limit: 25, skip: 0, take: 25 });
  });

  it('skips the pages before the one asked for', () => {
    expect(pageWindow({ page: 3, limit: 50 })).toEqual({
      page: 3,
      limit: 50,
      skip: 100,
      take: 50,
    });
  });

  // Nadie puede pedir la tabla entera en una sola página.
  it('never serves more than 100 rows at once', () => {
    expect(pageWindow({ limit: 100_000 }).take).toBe(100);
  });

  it('ignores values that make no sense', () => {
    expect(pageWindow({ page: 0, limit: -5 })).toMatchObject({
      page: 1,
      limit: 25,
    });
    expect(pageWindow({ page: Number.NaN })).toMatchObject({ page: 1 });
  });
});

describe('paginated', () => {
  it('reports the total and how many pages it makes', () => {
    expect(paginated(['a', 'b'], 143, { page: 2, limit: 25 })).toEqual({
      items: ['a', 'b'],
      total: 143,
      page: 2,
      limit: 25,
      totalPages: 6,
    });
  });

  it('counts one page for an empty result', () => {
    expect(paginated([], 0, { page: 1, limit: 25 }).totalPages).toBe(1);
  });
});

describe('orderByFrom', () => {
  type Order = Record<string, 'asc' | 'desc'>[];
  const columns: Record<string, (direction: 'asc' | 'desc') => Order> = {
    name: (direction) => [{ lastName: direction }],
    city: (direction) => [{ city: direction }],
  };
  const fallback: Order = [{ lastName: 'asc' }];

  it('sorts by the column asked for', () => {
    expect(
      orderByFrom({ sortBy: 'city', sortDir: 'desc' }, columns, fallback),
    ).toEqual([{ city: 'desc' }]);
    expect(orderByFrom({ sortBy: 'city' }, columns, fallback)).toEqual([
      { city: 'asc' },
    ]);
  });

  // Lo que no está declarado no llega a la consulta.
  it('falls back for a column that is not declared', () => {
    expect(orderByFrom({ sortBy: 'passwordHash' }, columns, fallback)).toBe(
      fallback,
    );
    expect(orderByFrom({ sortBy: 'constructor' }, columns, fallback)).toBe(
      fallback,
    );
    expect(orderByFrom({}, columns, fallback)).toBe(fallback);
  });
});

describe('searchWords', () => {
  it('splits the search into words', () => {
    expect(searchWords('  maria   gonzalez ')).toEqual(['maria', 'gonzalez']);
  });

  it('is empty when nothing was searched', () => {
    expect(searchWords(undefined)).toEqual([]);
    expect(searchWords('   ')).toEqual([]);
  });

  it('keeps the query bounded', () => {
    expect(searchWords('a b c d e f g h')).toHaveLength(6);
  });
});

describe('accentVariants', () => {
  it('also searches the word without its accents', () => {
    expect(accentVariants('benítez')).toEqual(['benítez', 'benitez']);
    expect(accentVariants('BENÍTEZ')).toEqual(['BENÍTEZ', 'BENITEZ']);
  });

  it('searches a plain word once', () => {
    expect(accentVariants('benitez')).toEqual(['benitez']);
  });
});
