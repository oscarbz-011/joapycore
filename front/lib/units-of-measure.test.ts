import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UNIT_CODE,
  UNITS_OF_MEASURE,
  unitOfMeasure,
  unitOptionGroups,
  unitSymbol,
} from './units-of-measure';

describe('units of measure', () => {
  it('mirrors the 64 codes of the SIFEN table', () => {
    const codes = UNITS_OF_MEASURE.map((u) => u.code);
    expect(codes).toHaveLength(64);
    expect(new Set(codes).size).toBe(64);
    expect(unitSymbol(DEFAULT_UNIT_CODE)).toBe('UNI');
  });

  it('counts whole units and measures with decimals', () => {
    expect(unitOfMeasure(131).decimals).toBe(0);
    expect(unitOfMeasure(109).decimals).toBe(3);
  });

  it('puts the units of the industry first and every other one after', () => {
    const { suggested, others } = unitOptionGroups('MUEBLERIA');
    expect(suggested.map((u) => u.code)).toEqual([77, 109, 87, 660, 110, 124, 132]);
    expect(others.some((u) => u.code === 109)).toBe(false);
    expect(suggested.length + others.length).toBe(64);
  });

  it('lists the whole table when the industry is unknown', () => {
    const { suggested, others } = unitOptionGroups(null);
    expect(suggested).toEqual([]);
    expect(others).toHaveLength(64);
  });
});
