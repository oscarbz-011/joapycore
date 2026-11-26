import { describe, expect, it } from 'vitest';
import {
  emptyPresentationForm,
  formFactor,
  presentationFormError,
  presentationPayload,
  suggestedPrice,
} from './presentations';

const board = { ...emptyPresentationForm(), name: 'Plancha entera', length: 2.75, width: 1.83, salePrice: 480000 };

describe('presentation form', () => {
  it('computes a board from its dimensions and suggests its price', () => {
    const factor = formFactor(board, 109);
    expect(factor?.toString()).toBe('5.0325');
    expect(suggestedPrice(95_000, factor)).toBe(478_088);
    expect(suggestedPrice(null, factor)).toBeNull();
  });

  it('takes a typed factor for what is counted', () => {
    const pack = { ...emptyPresentationForm(), name: 'Pack de 6', factor: 6, salePrice: 54000 };
    expect(formFactor(pack, 77)?.toString()).toBe('6');
    expect(presentationPayload(pack, 77)).toEqual({
      name: 'Pack de 6',
      unitCode: 77,
      salePrice: 54000,
      factor: 6,
    });
  });

  it('sends only the dimensions the unit asks for', () => {
    expect(presentationPayload({ ...board, height: 9 }, 109)).toEqual({
      name: 'Plancha entera',
      unitCode: 77,
      salePrice: 480000,
      length: 2.75,
      width: 1.83,
    });
  });

  it('says what is missing before saving', () => {
    expect(presentationFormError({ ...board, name: ' ' }, 109)).toBe('Poné un nombre a la presentación');
    expect(presentationFormError({ ...board, width: 0 }, 109)).toBe('Falta el ancho');
    expect(presentationFormError({ ...board, salePrice: 0 }, 109)).toBe('Poné el precio de la presentación');
    expect(presentationFormError({ ...emptyPresentationForm(), name: 'Pack' }, 77)).toBe(
      'Indicá cuánto del producto lleva',
    );
    expect(presentationFormError(board, 109)).toBeNull();
  });
});
