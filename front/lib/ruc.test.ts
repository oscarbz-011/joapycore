import { describe, expect, it } from 'vitest';
import { customerRucProblem, rucCheckDigit, rucProblem } from './ruc';

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

describe('customerRucProblem', () => {
  const legacy = { documentType: 'RUC', documentNumber: '80012345' };

  it('lets an old RUC stay as it was', () => {
    expect(customerRucProblem({ ...legacy }, legacy)).toBeNull();
  });

  it('checks the RUC as soon as it changes', () => {
    expect(customerRucProblem({ documentType: 'RUC', documentNumber: '80012346' }, legacy)).toMatch(
      /guion/,
    );
  });

  it('checks every RUC of a new customer', () => {
    expect(customerRucProblem(legacy)).toMatch(/guion/);
  });

  it('ignores other document types', () => {
    expect(customerRucProblem({ documentType: 'CI', documentNumber: '1234567' })).toBeNull();
  });
});
