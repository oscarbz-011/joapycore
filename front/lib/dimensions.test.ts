import { describe, expect, it } from 'vitest';
import {
  cutUnitPrice,
  factorFromDimensions,
  factorText,
  measureOf,
  saleItemName,
  soldAsLabel,
  soldUnitSymbol,
} from './dimensions';

describe('dimensions', () => {
  it('knows which units come from dimensions', () => {
    expect(measureOf(109)?.dimensions).toEqual(['length', 'width']);
    expect(measureOf(110)?.dimensions).toEqual(['length', 'width', 'height']);
    expect(measureOf(87)?.linearSymbol).toBe('m');
    expect(measureOf(77)).toBeNull();
    expect(measureOf(null)).toBeNull();
  });

  it('computes the exact area, length and volume', () => {
    expect(factorFromDimensions(109, { length: 2.75, width: 1.83 })?.toString()).toBe('5.0325');
    expect(factorFromDimensions(87, { length: '100' })?.toString()).toBe('100');
    expect(factorFromDimensions(110, { length: 2, width: 0.3, height: 0.05 })?.toString()).toBe('0.03');
  });

  it('waits until every dimension is there and positive', () => {
    expect(factorFromDimensions(109, { length: 2 })).toBeNull();
    expect(factorFromDimensions(109, { length: 2, width: 0 })).toBeNull();
    expect(factorFromDimensions(77, { length: 2 })).toBeNull();
  });

  it('prices a cut by what it takes, in whole guaraníes', () => {
    const factor = factorFromDimensions(109, { length: 1.2, width: 0.6 })!;
    expect(cutUnitPrice(95_000, factor)).toBe(68_400);
    expect(cutUnitPrice('95379', factorFromDimensions(109, { length: 1.234, width: 0.567 })!)).toBe(66_735);
  });

  it('describes how a line was sold', () => {
    expect(soldAsLabel({ presentationName: 'Plancha entera' }, 109)).toBe('Plancha entera');
    expect(soldAsLabel({ cutLength: '1.2', cutWidth: '0.6' }, 109)).toBe('corte 1,2 × 0,6 m');
    expect(soldAsLabel({}, 109)).toBeNull();
    expect(soldUnitSymbol({ unitCode: 77 }, 109)).toBe('UNI');
    expect(soldUnitSymbol({ unitCode: null }, 109)).toBe('M2');
    expect(factorText('5.0325', 109)).toBe('5,0325 M2');
  });

  it('names a sold line with how it was sold', () => {
    const product = { name: 'MDF 18 mm', unitCode: 109 };
    expect(saleItemName({ product, presentationName: 'Plancha entera' })).toBe('MDF 18 mm — Plancha entera');
    expect(saleItemName({ product, cutLength: '1.2', cutWidth: '0.6' })).toBe('MDF 18 mm — corte 1,2 × 0,6 m');
    expect(saleItemName({ product })).toBe('MDF 18 mm');
    expect(saleItemName({ product: null, description: 'Flete' })).toBe('Flete');
  });
});
