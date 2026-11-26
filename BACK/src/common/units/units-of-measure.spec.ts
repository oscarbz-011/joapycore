import { Industry } from '@prisma/client';
import {
  DEFAULT_UNIT_CODE,
  INDUSTRY_UNIT_CODES,
  UNITS_OF_MEASURE,
  unitOfMeasure,
  unitSymbol,
} from './units-of-measure';

describe('units of measure', () => {
  it('has the 64 codes of the SIFEN table, each once', () => {
    const codes = UNITS_OF_MEASURE.map((u) => u.code);
    expect(codes).toHaveLength(64);
    expect(new Set(codes).size).toBe(64);
  });

  it('defaults to the SIFEN unit (77)', () => {
    expect(unitOfMeasure(DEFAULT_UNIT_CODE)).toMatchObject({
      symbol: 'UNI',
      decimals: 0,
    });
  });

  it('allows decimals for what is measured and not for what is counted', () => {
    expect(unitOfMeasure(83).decimals).toBe(3);
    expect(unitOfMeasure(109).decimals).toBe(3);
    expect(unitOfMeasure(131).decimals).toBe(0);
    expect(unitOfMeasure(121).decimals).toBe(0);
  });

  it('uses the SIFEN representation as the printed symbol', () => {
    expect(unitSymbol(109)).toBe('M2');
    expect(unitSymbol(660)).toBe('ml');
  });

  it('rejects a code outside the table', () => {
    expect(() => unitOfMeasure(1)).toThrow('Unidad de medida desconocida: 1');
  });

  it('suggests only codes of the table for every industry', () => {
    for (const industry of Object.values(Industry)) {
      for (const code of INDUSTRY_UNIT_CODES[industry]) {
        expect(() => unitOfMeasure(code)).not.toThrow();
      }
    }
  });
});
