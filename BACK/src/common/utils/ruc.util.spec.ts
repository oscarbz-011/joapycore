import { rucCheckDigit, rucProblem } from './ruc.util';

describe('RUC', () => {
  it.each([
    ['80069563', 1],
    ['44444401', 7],
    ['2005001', 1],
    ['1131421', 4],
  ])('calcula el dígito verificador de %s', (base, digit) => {
    expect(rucCheckDigit(base)).toBe(digit);
  });

  it('acepta un RUC con su dígito correcto', () => {
    expect(rucProblem('80069563-1')).toBeNull();
    expect(rucProblem(' 44444401-7 ')).toBeNull();
  });

  it('rechaza un dígito incorrecto', () => {
    expect(rucProblem('80069563-2')).toBe(
      'El dígito verificador del RUC no es correcto',
    );
  });

  it.each(['80069563', '80069563-12', 'ABC-1', '123456789-1'])(
    'pide el formato con guion para %s',
    (value) => {
      expect(rucProblem(value)).toContain('dígito verificador separado');
    },
  );
});
