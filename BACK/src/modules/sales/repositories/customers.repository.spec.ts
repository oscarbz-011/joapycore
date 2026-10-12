import { CustomersRepository } from './customers.repository';

describe('CustomersRepository.findPage', () => {
  let prisma: {
    customer: { findMany: jest.Mock; count: jest.Mock };
    $transaction: jest.Mock;
  };
  let repository: CustomersRepository;

  beforeEach(() => {
    prisma = {
      customer: {
        findMany: jest.fn().mockReturnValue('rows'),
        count: jest.fn().mockReturnValue('count'),
      },
      $transaction: jest.fn().mockResolvedValue([[{ id: 'c-1' }], 143]),
    };
    repository = new CustomersRepository(prisma as never);
  });

  const page = (words: string[]) =>
    repository.findPage('tenant-1', {
      words,
      orderBy: [{ lastName: 'asc' }],
      skip: 25,
      take: 25,
    });
  const whereOf = () =>
    prisma.customer.findMany.mock.calls[0][0].where as {
      tenantId: string;
      deletedAt: null;
      AND: { OR: Record<string, unknown>[] }[];
    };

  it('reads only active customers of the tenant, one page at a time', async () => {
    const result = await page([]);

    expect(whereOf()).toMatchObject({ tenantId: 'tenant-1', deletedAt: null });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25 }),
    );
    expect(result).toEqual({ items: [{ id: 'c-1' }], total: 143 });
  });

  // La cuenta usa el mismo filtro que la página: si no, el total miente.
  it('counts with the same filter it lists with', async () => {
    await page(['benitez']);

    expect(prisma.customer.count).toHaveBeenCalledWith({ where: whereOf() });
  });

  // "BENÍTEZ" tiene que encontrar "Benitez" y "Benítez".
  it('searches without telling accents or capitals apart', async () => {
    await page(['BENÍTEZ']);

    expect(whereOf().AND[0].OR[0]).toEqual({
      searchText: { contains: 'benitez' },
    });
  });

  it('requires every word to match', async () => {
    await page(['maria', 'gonzalez']);

    expect(whereOf().AND).toHaveLength(2);
  });

  // Una base creada con `db push` no tiene el texto de búsqueda.
  it('still searches field by field where the search text is missing', async () => {
    await page(['benítez']);

    const fallback = whereOf().AND[0].OR[1] as {
      searchText: null;
      OR: Record<string, unknown>[];
    };
    expect(fallback.searchText).toBeNull();
    expect(fallback.OR).toContainEqual({
      lastName: { contains: 'benitez', mode: 'insensitive' },
    });
  });
});
