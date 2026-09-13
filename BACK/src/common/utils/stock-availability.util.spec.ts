import { UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { assertStockAvailable } from './stock-availability.util';

function makeTx(sums: Record<string, number>) {
  const calls: string[] = [];
  const tx = {
    $executeRaw: jest.fn((_strings: TemplateStringsArray, key: string) => {
      calls.push(key);
      return Promise.resolve(1);
    }),
    stockMovement: {
      groupBy: jest.fn(({ where }: { where: { productId: { in: string[] } } }) =>
        Promise.resolve(
          where.productId.in
            .filter((id) => id in sums)
            .map((id) => ({ productId: id, _sum: { quantity: sums[id] } })),
        ),
      ),
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, raw: tx, calls };
}

describe('assertStockAvailable', () => {
  it('passes when every product has enough stock', async () => {
    const { tx } = makeTx({ a: 5, b: 2 });
    await expect(
      assertStockAvailable(tx, 't1', [
        { productId: 'a', quantity: 5 },
        { productId: 'b', quantity: 1 },
      ]),
    ).resolves.toBeUndefined();
  });

  it('adds up repeated lines of the same product before comparing', async () => {
    const { tx } = makeTx({ a: 3 });
    await expect(
      assertStockAvailable(tx, 't1', [
        { productId: 'a', quantity: 2, name: 'Heladera' },
        { productId: 'a', quantity: 2, name: 'Heladera' },
      ]),
    ).rejects.toThrow('Heladera (disponible 3, pedido 4)');
  });

  it('treats a product without movements as zero stock', async () => {
    const { tx } = makeTx({});
    await expect(
      assertStockAvailable(tx, 't1', [{ productId: 'x', quantity: 1, name: 'Tornillo' }]),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('never reports negative availability in the message', async () => {
    const { tx } = makeTx({ a: -2 });
    await expect(
      assertStockAvailable(tx, 't1', [{ productId: 'a', quantity: 1, name: 'A' }]),
    ).rejects.toThrow('A (disponible 0, pedido 1)');
  });

  it('locks each product once, in a stable order, scoped by tenant', async () => {
    const { tx, calls } = makeTx({ a: 9, b: 9 });
    await assertStockAvailable(tx, 't1', [
      { productId: 'b', quantity: 1 },
      { productId: 'a', quantity: 1 },
      { productId: 'b', quantity: 1 },
    ]);
    expect(calls).toEqual(['stock:t1:a', 'stock:t1:b']);
  });

  it('does nothing when there is no demand', async () => {
    const { tx, raw } = makeTx({});
    await assertStockAvailable(tx, 't1', [{ productId: 'a', quantity: 0 }]);
    expect(raw.$executeRaw).not.toHaveBeenCalled();
    expect(raw.stockMovement.groupBy).not.toHaveBeenCalled();
  });
});
