import { describe, expect, it } from 'vitest';
import { normalizeProduct } from './inventory';

describe('normalizeProduct', () => {
  it('turns the decimal prices the API sends as text into numbers', () => {
    expect(
      normalizeProduct({
        id: 'p1',
        costPrice: '400000',
        salePrice: '600000.50',
        additionalMarkup: '10',
      }),
    ).toEqual({
      id: 'p1',
      costPrice: 400000,
      salePrice: 600000.5,
      additionalMarkup: 10,
    });
  });

  it('keeps pending prices as null and leaves numbers untouched', () => {
    expect(
      normalizeProduct({
        id: 'p1',
        costPrice: null,
        salePrice: 600000,
        additionalMarkup: null,
      }),
    ).toEqual({
      id: 'p1',
      costPrice: null,
      salePrice: 600000,
      additionalMarkup: null,
    });
  });
});
