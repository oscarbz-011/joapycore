import { describe, expect, it } from 'vitest';
import { formatQty, qty, quantityError, quantityStep, sumQty } from './quantity';

describe('quantities', () => {
  it('reads the API text exactly and adds without float errors', () => {
    expect(qty('2.375').toString()).toBe('2.375');
    expect(sumQty(['0.1', 0.2]).toString()).toBe('0.3');
    expect(qty(null).toString()).toBe('0');
  });

  it('formats with the Paraguayan comma and without trailing zeros', () => {
    expect(formatQty('2.37500000')).toBe('2,375');
    expect(formatQty('1500')).toBe('1.500');
    expect(formatQty(3)).toBe('3');
  });

  it('steps by one for counted units and by a thousandth for measured ones', () => {
    expect(quantityStep(77)).toBe(1);
    expect(quantityStep(109)).toBe(0.001);
    expect(quantityStep(109, true)).toBe(1);
  });

  it('explains why a quantity does not fit its unit', () => {
    const chair = { name: 'Silla', unitCode: 77 };
    const board = { name: 'Melamina', unitCode: 109 };
    expect(quantityError(1.5, chair)).toBe('"Silla" se cuenta por unidad entera');
    expect(quantityError(2.3755, board)).toBe('"Melamina" admite hasta 3 decimales');
    expect(quantityError(0, board)).toBe('La cantidad de "Melamina" tiene que ser mayor que cero');
    expect(quantityError(2.375, board)).toBeNull();
    expect(quantityError(2, chair)).toBeNull();
  });
});
