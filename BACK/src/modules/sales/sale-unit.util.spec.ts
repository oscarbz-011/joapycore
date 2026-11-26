import { Prisma, type ProductPresentation } from '@prisma/client';
import { baseQuantity } from '../../common/units/quantity';
import { resolveSaleUnit } from './sale-unit.util';

const dec = (v: string | number) => new Prisma.Decimal(v);

const board = {
  id: 'p1',
  name: 'MDF 18 mm',
  unitCode: 109,
  isSerialized: false,
};
const fridge = { id: 'p2', name: 'Heladera', unitCode: 77, isSerialized: true };

const sheet = {
  id: 'pp1',
  productId: 'p1',
  name: 'Plancha entera',
  unitCode: 77,
  factor: dec('5.0325'),
  isActive: true,
} as ProductPresentation;
const presentations = new Map([[sheet.id, sheet]]);

describe('resolveSaleUnit', () => {
  it('sells in the product unit with factor 1', () => {
    const unit = resolveSaleUnit({ quantity: '2.375' }, board, presentations);
    expect(unit).toMatchObject({
      presentationId: null,
      unitCode: null,
      unitFactor: dec(1),
      baseQuantity: dec('2.375'),
    });
  });

  it('takes the factor of the presentation, not from the client', () => {
    const unit = resolveSaleUnit(
      { quantity: 2, presentationId: 'pp1' },
      board,
      presentations,
    );
    expect(unit).toMatchObject({
      presentationId: 'pp1',
      presentationName: 'Plancha entera',
      unitCode: 77,
      unitFactor: dec('5.0325'),
      baseQuantity: dec('10.065'),
    });
  });

  it('sells a presentation by whole units', () => {
    expect(() =>
      resolveSaleUnit(
        { quantity: 1.5, presentationId: 'pp1' },
        board,
        presentations,
      ),
    ).toThrow('"MDF 18 mm (Plancha entera)" se cuenta por unidad entera');
  });

  it('rejects a presentation of another product or a deactivated one', () => {
    const other = { ...board, id: 'p9' };
    expect(() =>
      resolveSaleUnit(
        { quantity: 1, presentationId: 'pp1' },
        other,
        presentations,
      ),
    ).toThrow('La presentación elegida no es de "MDF 18 mm"');
    expect(() =>
      resolveSaleUnit(
        { quantity: 1, presentationId: 'missing' },
        board,
        presentations,
      ),
    ).toThrow('La presentación elegida no es de "MDF 18 mm"');
    const off = new Map([[sheet.id, { ...sheet, isActive: false }]]);
    expect(() =>
      resolveSaleUnit({ quantity: 1, presentationId: 'pp1' }, board, off),
    ).toThrow('está desactivada');
  });

  it('computes a cut from its dimensions, sold by pieces', () => {
    const unit = resolveSaleUnit(
      { quantity: 2, cut: { length: 1.2, width: 0.6 } },
      board,
      presentations,
    );
    expect(unit).toMatchObject({
      unitCode: 77,
      unitFactor: dec('0.72'),
      cutLength: dec('1.2'),
      cutWidth: dec('0.6'),
      cutHeight: null,
      baseQuantity: dec('1.44'),
    });
    expect(() =>
      resolveSaleUnit(
        { quantity: 1.5, cut: { length: 1.2, width: 0.6 } },
        board,
        presentations,
      ),
    ).toThrow('se cuenta por unidad entera');
  });

  it('rejects a cut of something that is not measured', () => {
    const soda = {
      id: 'p3',
      name: 'Gaseosa',
      unitCode: 77,
      isSerialized: false,
    };
    expect(() =>
      resolveSaleUnit({ quantity: 1, cut: { length: 1 } }, soda, presentations),
    ).toThrow('La unidad UNI no se calcula con medidas');
  });

  it('refuses mixing, serialized products and free lines', () => {
    expect(() =>
      resolveSaleUnit(
        { quantity: 1, presentationId: 'pp1', cut: { length: 1, width: 1 } },
        board,
        presentations,
      ),
    ).toThrow('elegí una presentación o un corte a medida, no los dos');
    expect(() =>
      resolveSaleUnit(
        { quantity: 1, presentationId: 'pp1' },
        fridge,
        presentations,
      ),
    ).toThrow('tiene número de serie');
    expect(() =>
      resolveSaleUnit(
        { quantity: 1, presentationId: 'pp1' },
        null,
        presentations,
      ),
    ).toThrow('Una línea sin producto no lleva presentación ni medidas');
  });

  it('keeps the product unit rule on plain lines', () => {
    expect(() =>
      resolveSaleUnit(
        { quantity: 1.5 },
        { ...fridge, isSerialized: false },
        presentations,
      ),
    ).toThrow('se cuenta por unidad entera');
  });
});

describe('baseQuantity', () => {
  it('multiplies by the stored factor, 1 for older lines', () => {
    expect(baseQuantity({ quantity: 3, unitFactor: '5.0325' })).toEqual(
      dec('15.0975'),
    );
    expect(baseQuantity({ quantity: '2.5' })).toEqual(dec('2.5'));
  });
});
