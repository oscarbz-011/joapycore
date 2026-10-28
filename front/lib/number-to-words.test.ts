import { describe, expect, it } from 'vitest';
import { guaraniesInWords, numberToWords } from './number-to-words';

describe('numberToWords', () => {
  it.each([
    [0, 'CERO'],
    [1, 'UN'],
    [15, 'QUINCE'],
    [21, 'VEINTIÚN'],
    [30, 'TREINTA'],
    [45, 'CUARENTA Y CINCO'],
    [100, 'CIEN'],
    [101, 'CIENTO UN'],
    [500, 'QUINIENTOS'],
    [999, 'NOVECIENTOS NOVENTA Y NUEVE'],
    [1_000, 'MIL'],
    [1_001, 'MIL UN'],
    [21_000, 'VEINTIÚN MIL'],
    [100_000, 'CIEN MIL'],
    [325_000, 'TRESCIENTOS VEINTICINCO MIL'],
    [1_000_000, 'UN MILLÓN'],
    [1_200_000, 'UN MILLÓN DOSCIENTOS MIL'],
    [2_500_350, 'DOS MILLONES QUINIENTOS MIL TRESCIENTOS CINCUENTA'],
    [21_000_000, 'VEINTIÚN MILLONES'],
    [999_999_999, 'NOVECIENTOS NOVENTA Y NUEVE MILLONES NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE'],
  ])('writes %i as %s', (value, words) => {
    expect(numberToWords(value)).toBe(words);
  });

  it('drops decimals', () => {
    expect(numberToWords(1_500.75)).toBe('MIL QUINIENTOS');
  });
});

describe('guaraniesInWords', () => {
  it('writes the total of an invoice', () => {
    expect(guaraniesInWords(220_000)).toBe('GUARANÍES DOSCIENTOS VEINTE MIL');
  });
});
