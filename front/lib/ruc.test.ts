import { describe, expect, it } from 'vitest';
import { rucCheckDigit, rucProblem } from './ruc';

describe('rucCheckDigit', () => {
  it.each([
    ['80069563', 1],
    ['44444401', 7],
    ['2005001', 1],
    ['1131421', 4],
  ])('computes the check digit of %s', (base, digit) => {
    expect(rucCheckDigit(base)).toBe(digit);
  });
});

describe('rucProblem', () => {
  it('accepts a RUC with its correct check digit', () => {
    expect(rucProblem(' 80069563-1 ')).toBeNull();
  });

  it('asks for the check digit separated by a hyphen', () => {
    expect(rucProblem('800695631')).toMatch(/guion/);
    expect(rucProblem('80069563')).toMatch(/guion/);
  });

  it('rejects a wrong check digit', () => {
    expect(rucProblem('80069563-2')).toBe('El dígito verificador del RUC no es correcto');
  });
});
