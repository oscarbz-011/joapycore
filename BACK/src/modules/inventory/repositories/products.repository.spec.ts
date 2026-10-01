import { ProductsRepository } from './products.repository';

describe('ProductsRepository', () => {
  let repository: ProductsRepository;
  let prisma: {
    product: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    repository = new ProductsRepository(prisma as any);
  });

  it('filters products by sales channel membership', async () => {
    await repository.findAll('tenant-1', { salesChannel: 'POS' } as any);

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          salesChannels: { has: 'POS' },
        }),
      }),
    );
  });

  it('does not constrain sales channels when the filter is omitted', async () => {
    await repository.findAll('tenant-1');

    const call = prisma.product.findMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('salesChannels');
  });
});
