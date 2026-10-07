import { describe, expect, it } from 'vitest';
import {
  AVAILABILITY_LABEL,
  numberOrNull,
  tierRowsError,
  tierRowsFrom,
  tierRowsTo,
  volumeDiscountsSummary,
} from './commercial-terms';

describe('numberOrNull', () => {
  // La API manda los decimales como texto; null y vacío son "no se sabe".
  it('reads API decimals and form text as numbers', () => {
    expect(numberOrNull('80000')).toBe(80_000);
    expect(numberOrNull(7)).toBe(7);
    expect(numberOrNull('0')).toBe(0);
  });

  it('keeps unknown as unknown, never zero', () => {
    expect(numberOrNull(null)).toBeNull();
    expect(numberOrNull(undefined)).toBeNull();
    expect(numberOrNull('  ')).toBeNull();
    expect(numberOrNull('abc')).toBeNull();
  });
});

describe('tier rows', () => {
  it('loads the stored tiers into editable rows', () => {
    expect(
      tierRowsFrom([{ minAmount: 1_000_000, percent: 2 }], 'minAmount', 'percent'),
    ).toEqual([{ from: '1000000', value: '2' }]);
    expect(tierRowsFrom(null, 'minAmount', 'percent')).toEqual([]);
  });

  it('sends the completed rows and drops the blank ones', () => {
    expect(
      tierRowsTo(
        [
          { from: '10', value: '48000' },
          { from: '', value: '' },
        ],
        'minQuantity',
        'price',
      ),
    ).toEqual([{ minQuantity: 10, price: 48_000 }]);
  });

  it('flags a row filled halfway', () => {
    expect(tierRowsError([{ from: '10', value: '' }])).toContain('incompleto');
    expect(tierRowsError([{ from: '', value: '5' }])).toContain('incompleto');
  });

  it('flags zero or negative values', () => {
    expect(tierRowsError([{ from: '0', value: '5' }])).toContain('mayores a cero');
  });

  it('flags two rows that start at the same point', () => {
    expect(
      tierRowsError([
        { from: '10', value: '48000' },
        { from: '10', value: '45000' },
      ]),
    ).toContain('repetido');
  });

  it('accepts complete rows and ignores blank ones', () => {
    expect(
      tierRowsError([
        { from: '10', value: '48000' },
        { from: '', value: '' },
      ]),
    ).toBeNull();
  });
});

describe('volumeDiscountsSummary', () => {
  it('describes each tier', () => {
    expect(
      volumeDiscountsSummary([
        { minAmount: 1_000_000, percent: 2 },
        { minAmount: 5_000_000, percent: 5 },
      ]),
    ).toBe('2% desde Gs. 1.000.000 · 5% desde Gs. 5.000.000');
  });

  it('says so when there are none', () => {
    expect(volumeDiscountsSummary([])).toBe('Sin descuentos');
  });
});

describe('AVAILABILITY_LABEL', () => {
  it('names every state', () => {
    expect(AVAILABILITY_LABEL).toEqual({
      AVAILABLE: 'Disponible',
      ON_ORDER: 'A pedido',
      OUT_OF_STOCK: 'Sin stock',
    });
  });
});
