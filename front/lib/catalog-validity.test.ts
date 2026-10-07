import { describe, expect, it } from 'vitest';
import {
  EXPIRING_SOON_DAYS,
  priceValidity,
  validityLabel,
  validityRangeError,
} from './catalog-validity';

const TODAY = '2026-10-06';
const day = (iso: string | null) => (iso ? `${iso}T00:00:00.000Z` : null);
const item = (from: string | null, to: string | null) => ({
  validFrom: day(from),
  validTo: day(to),
});

describe('priceValidity', () => {
  it('treats a price without dates as open-ended', () => {
    expect(priceValidity(item(null, null), TODAY)).toEqual({
      status: 'open',
      daysLeft: null,
    });
  });

  it('is valid through its last day', () => {
    expect(priceValidity(item(null, '2026-12-31'), TODAY).status).toBe('valid');
    expect(priceValidity(item(null, TODAY), TODAY)).toEqual({
      status: 'expiring',
      daysLeft: 0,
    });
  });

  it('is expired from the day after', () => {
    expect(priceValidity(item(null, '2026-10-05'), TODAY)).toEqual({
      status: 'expired',
      daysLeft: -1,
    });
  });

  it('flags prices about to expire', () => {
    expect(priceValidity(item(null, '2026-10-13'), TODAY)).toEqual({
      status: 'expiring',
      daysLeft: EXPIRING_SOON_DAYS,
    });
    expect(priceValidity(item(null, '2026-10-14'), TODAY).status).toBe('valid');
  });

  it('does not apply a price before its first day', () => {
    expect(priceValidity(item('2026-11-01', null), TODAY).status).toBe(
      'upcoming',
    );
    expect(priceValidity(item(TODAY, null), TODAY).status).toBe('valid');
  });

  it('keeps an open-ended price that already started as valid', () => {
    expect(priceValidity(item('2026-01-01', null), TODAY)).toEqual({
      status: 'valid',
      daysLeft: null,
    });
  });
});

describe('validityLabel', () => {
  it.each([
    [item(null, null), 'Sin vencimiento'],
    [item('2026-01-01', null), 'Sin vencimiento'],
    [item(null, '2026-12-31'), 'Hasta 31/12/2026'],
    [item(null, '2026-10-09'), 'Vence en 3 días'],
    [item(null, '2026-10-07'), 'Vence mañana'],
    [item(null, TODAY), 'Vence hoy'],
    [item(null, '2026-09-30'), 'Venció el 30/09/2026'],
    [item('2026-11-01', null), 'Rige desde 01/11/2026'],
  ])('%o → %s', (value, label) => {
    expect(validityLabel(value, TODAY)).toBe(label);
  });
});

describe('validityRangeError', () => {
  it('accepts open ends and ordered dates', () => {
    expect(validityRangeError('', '')).toBeNull();
    expect(validityRangeError('2026-10-01', '')).toBeNull();
    expect(validityRangeError('2026-10-01', '2026-10-01')).toBeNull();
  });

  it('rejects a validity that ends before it starts', () => {
    expect(validityRangeError('2026-10-31', '2026-10-01')).toContain('antes');
  });
});
