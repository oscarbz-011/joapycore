import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UNIT_CODE,
  UNITS_OF_MEASURE,
  habitualUnits,
  matchesUnit,
  unitOfMeasure,
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

  it('shows the units of the industry, then the ones the company already uses', () => {
    const codes = habitualUnits('MUEBLERIA', [77, 89]).map((u) => u.code);
    expect(codes).toEqual([77, 109, 87, 660, 110, 124, 132, 89]);
  });

  it('keeps the unit of the product being edited even if it is unusual', () => {
    expect(habitualUnits('ELECTRODOMESTICOS', [], 869).map((u) => u.code)).toEqual([
      77, 132, 117, 869,
    ]);
  });

  it('offers only the unit when the industry is unknown', () => {
    expect(habitualUnits(null, []).map((u) => u.code)).toEqual([77]);
  });

  it('finds a unit by name or symbol, ignoring case and accents', () => {
    const liter = unitOfMeasure(89);
    expect(matchesUnit(liter, 'litro')).toBe(true);
    expect(matchesUnit(liter, 'lt')).toBe(true);
    expect(matchesUnit(unitOfMeasure(110), 'cubicos')).toBe(true);
    expect(matchesUnit(liter, 'kilo')).toBe(false);
    expect(UNITS_OF_MEASURE.filter((u) => matchesUnit(u, ''))).toHaveLength(64);
  });
});
