import { UnprocessableEntityException } from '@nestjs/common';
import {
  aggregateDemands,
  assertDemandsCovered,
} from './stock-availability.util';

describe('aggregateDemands', () => {
  it('adds up repeated lines of the same product and ignores empty ones', () => {
    const totals = aggregateDemands([
      { productId: 'a', warehouseId: 'wh-1', quantity: 2, name: 'Heladera' },
      { productId: 'a', warehouseId: 'wh-1', quantity: 2, name: 'Heladera' },
      { productId: 'a', warehouseId: 'wh-2', quantity: 1, name: 'Heladera' },
      { productId: 'b', warehouseId: 'wh-1', quantity: 0 },
    ]);
    expect([...totals.entries()]).toEqual([
      [
        'a::wh-1',
        {
          productId: 'a',
          warehouseId: 'wh-1',
          quantity: 4,
          name: 'Heladera',
        },
      ],
      [
        'a::wh-2',
        {
          productId: 'a',
          warehouseId: 'wh-2',
          quantity: 1,
          name: 'Heladera',
        },
      ],
    ]);
  });
});

describe('assertDemandsCovered', () => {
  const totals = (entries: [string, number, string?][]) =>
    new Map(
      entries.map(([id, quantity, name]) => [
        `${id}::wh-1`,
        { productId: id, warehouseId: 'wh-1', quantity, name },
      ]),
    );

  it('passes when every product has enough stock', () => {
    expect(() =>
      assertDemandsCovered(
        totals([
          ['a', 5],
          ['b', 1],
        ]),
        new Map([
          ['a::wh-1', 5],
          ['b::wh-1', 2],
        ]),
      ),
    ).not.toThrow();
  });

  it('lists every product that falls short', () => {
    expect(() =>
      assertDemandsCovered(
        totals([
          ['a', 4, 'Heladera'],
          ['b', 1, 'Tornillo'],
        ]),
        new Map([['a::wh-1', 3]]),
      ),
    ).toThrow(
      'No hay stock suficiente de: Heladera (disponible 3, pedido 4); Tornillo (disponible 0, pedido 1)',
    );
  });

  it('never reports negative availability', () => {
    expect(() =>
      assertDemandsCovered(totals([['a', 1, 'A']]), new Map([['a::wh-1', -2]])),
    ).toThrow('A (disponible 0, pedido 1)');
  });

  it('throws a 422', () => {
    expect(() => assertDemandsCovered(totals([['x', 1]]), new Map())).toThrow(
      UnprocessableEntityException,
    );
  });
});
