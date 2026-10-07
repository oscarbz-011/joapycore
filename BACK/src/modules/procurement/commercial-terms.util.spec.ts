import { UnprocessableEntityException } from '@nestjs/common';
import {
  normalizePriceTiers,
  normalizeVolumeDiscounts,
} from './commercial-terms.util';

describe('normalizeVolumeDiscounts', () => {
  it('orders the tiers by the amount they start at', () => {
    expect(
      normalizeVolumeDiscounts([
        { minAmount: 5_000_000, percent: 5 },
        { minAmount: 1_000_000, percent: 2 },
      ]),
    ).toEqual([
      { minAmount: 1_000_000, percent: 2 },
      { minAmount: 5_000_000, percent: 5 },
    ]);
  });

  it('treats nothing as no discount', () => {
    expect(normalizeVolumeDiscounts(undefined)).toEqual([]);
    expect(normalizeVolumeDiscounts([])).toEqual([]);
  });

  it('rejects two tiers that start at the same amount', () => {
    expect(() =>
      normalizeVolumeDiscounts([
        { minAmount: 1_000_000, percent: 2 },
        { minAmount: 1_000_000, percent: 3 },
      ]),
    ).toThrow(UnprocessableEntityException);
  });

  // Comprar más no puede salir más caro: un tramo mayor con menos descuento
  // es un error de carga.
  it('rejects a bigger order that gets a smaller discount', () => {
    expect(() =>
      normalizeVolumeDiscounts([
        { minAmount: 1_000_000, percent: 5 },
        { minAmount: 5_000_000, percent: 2 },
      ]),
    ).toThrow(UnprocessableEntityException);
  });
});

describe('normalizePriceTiers', () => {
  it('orders the tiers by quantity', () => {
    expect(
      normalizePriceTiers([
        { minQuantity: 50, price: 40_000 },
        { minQuantity: 10, price: 48_000 },
      ]),
    ).toEqual([
      { minQuantity: 10, price: 48_000 },
      { minQuantity: 50, price: 40_000 },
    ]);
  });

  it('rejects two tiers for the same quantity', () => {
    expect(() =>
      normalizePriceTiers([
        { minQuantity: 10, price: 48_000 },
        { minQuantity: 10, price: 45_000 },
      ]),
    ).toThrow(UnprocessableEntityException);
  });

  it('rejects a bigger quantity at a higher price', () => {
    expect(() =>
      normalizePriceTiers([
        { minQuantity: 10, price: 40_000 },
        { minQuantity: 50, price: 48_000 },
      ]),
    ).toThrow(UnprocessableEntityException);
  });

  // El precio de lista es el tramo desde 1 unidad: un tramo no puede costar
  // más que eso.
  it('rejects a tier above the list price', () => {
    expect(() =>
      normalizePriceTiers([{ minQuantity: 10, price: 60_000 }], 54_000),
    ).toThrow(UnprocessableEntityException);
    expect(
      normalizePriceTiers([{ minQuantity: 10, price: 50_000 }], 54_000),
    ).toHaveLength(1);
  });
});
