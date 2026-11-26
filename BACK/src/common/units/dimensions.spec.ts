import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  factorFromDimensions,
  measureOf,
  presentationsEnabledFor,
  withSoldAs,
} from './dimensions';

const dec = (v: string | number) => new Prisma.Decimal(v);

describe('dimensions', () => {
  it('knows which units come from dimensions', () => {
    expect(measureOf(109)).toEqual({
      kind: 'AREA',
      dimensions: ['length', 'width'],
      linearSymbol: 'm',
    });
    expect(measureOf(660)?.dimensions).toEqual(['length']);
    expect(measureOf(93)?.linearSymbol).toBe('cm');
    expect(measureOf(77)).toBeNull();
    expect(measureOf(83)).toBeNull();
  });

  it('computes the area of a board', () => {
    expect(
      factorFromDimensions(109, { length: '2.75', width: '1.83' }),
    ).toEqual(dec('5.0325'));
  });

  it('computes length and volume', () => {
    expect(factorFromDimensions(87, { length: 3.5 })).toEqual(dec('3.5'));
    expect(
      factorFromDimensions(110, { length: 2, width: '0.3', height: '0.05' }),
    ).toEqual(dec('0.03'));
  });

  it('keeps the exact result, up to the 8 decimals of the column', () => {
    expect(
      factorFromDimensions(109, { length: '1.234', width: '0.567' }),
    ).toEqual(dec('0.699678'));
    expect(
      factorFromDimensions(110, {
        length: '1.111',
        width: '1.111',
        height: '1.111',
      }),
    ).toEqual(dec('1.37133063'));
  });

  it('rejects a unit that does not come from dimensions', () => {
    expect(() => factorFromDimensions(77, { length: 1 })).toThrow(
      'La unidad UNI no se calcula con medidas',
    );
  });

  it('asks for every dimension of the unit and nothing more', () => {
    expect(() => factorFromDimensions(109, { length: 2 })).toThrow(
      'Falta el ancho',
    );
    expect(() => factorFromDimensions(87, { length: 2, width: 1 })).toThrow(
      'La unidad m solo lleva largo',
    );
  });

  it('rejects zero, negative and sub-millimetre dimensions', () => {
    expect(() => factorFromDimensions(87, { length: 0 })).toThrow(
      UnprocessableEntityException,
    );
    expect(() => factorFromDimensions(87, { length: '1.2345' })).toThrow(
      'El largo admite hasta 3 decimales',
    );
  });

  it('rejects a result that rounds to zero', () => {
    expect(() =>
      factorFromDimensions(110, {
        length: '0.001',
        width: '0.001',
        height: '0.001',
      }),
    ).toThrow('La medida es demasiado chica');
  });

  it('turns presentations on by default for hardware, furniture and supermarkets', () => {
    expect(presentationsEnabledFor(null, 'FERRETERIA')).toBe(true);
    expect(presentationsEnabledFor(null, 'MUEBLERIA')).toBe(true);
    expect(presentationsEnabledFor(null, 'SUPERMERCADO')).toBe(true);
    expect(presentationsEnabledFor(null, 'ELECTRODOMESTICOS')).toBe(false);
    expect(presentationsEnabledFor(null, null)).toBe(false);
    expect(presentationsEnabledFor(false, 'FERRETERIA')).toBe(false);
    expect(presentationsEnabledFor(true, 'ELECTRODOMESTICOS')).toBe(true);
  });

  it('describes how a line was sold', () => {
    expect(
      withSoldAs('MDF 18 mm', { presentationName: 'Plancha entera' }, 109),
    ).toBe('MDF 18 mm — Plancha entera');
    expect(
      withSoldAs('MDF 18 mm', { cutLength: dec('1.2'), cutWidth: '0.6' }, 109),
    ).toBe('MDF 18 mm — corte 1,2 × 0,6 m');
    expect(withSoldAs('Cable', { cutLength: 15 }, 87)).toBe(
      'Cable — corte 15 m',
    );
    expect(withSoldAs('MDF 18 mm', {}, 109)).toBe('MDF 18 mm');
  });
});
