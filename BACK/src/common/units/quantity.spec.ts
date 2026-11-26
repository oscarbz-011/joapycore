import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertQuantityForUnit, qty, remainingQty, sumQty } from './quantity';

const dec = (v: string | number) => new Prisma.Decimal(v);

describe('quantities', () => {
  it('adds decimal quantities exactly', () => {
    expect(sumQty([0.1, 0.2, '2.375'])).toEqual(dec('2.675'));
    expect(qty(null)).toEqual(dec(0));
  });

  it('never returns a negative remainder', () => {
    expect(remainingQty('5.5', 2)).toEqual(dec('3.5'));
    expect(remainingQty(2, 5)).toEqual(dec(0));
  });

  describe('assertQuantityForUnit', () => {
    const board = { name: 'Plancha MDF', unitCode: 109 };
    const fridge = { name: 'Heladera', unitCode: 77 };

    it('accepts up to 3 decimals for a measured unit', () => {
      expect(assertQuantityForUnit('2.375', board)).toEqual(dec('2.375'));
    });

    it('rejects a fourth decimal for a measured unit', () => {
      expect(() => assertQuantityForUnit('2.3755', board)).toThrow(
        '"Plancha MDF" admite hasta 3 decimales: 2.3755 tiene más',
      );
    });

    it('rejects a fraction of a counted unit', () => {
      expect(() => assertQuantityForUnit(1.5, fridge)).toThrow(
        '"Heladera" se cuenta por unidad entera: no admite 1.5',
      );
      expect(assertQuantityForUnit(2, fridge)).toEqual(dec(2));
    });

    it('counts serialized goods by whole units whatever the unit', () => {
      expect(() =>
        assertQuantityForUnit('1.5', { ...board, isSerialized: true }),
      ).toThrow(UnprocessableEntityException);
    });

    it('rejects zero and negative quantities', () => {
      expect(() => assertQuantityForUnit(0, fridge)).toThrow(
        'La cantidad de "Heladera" tiene que ser mayor que cero',
      );
      expect(() => assertQuantityForUnit(-1, board)).toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
