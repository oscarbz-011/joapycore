import type Decimal from 'decimal.js';
import type { ProductPresentation, ProductPresentationPayload } from './api/inventory';
import { factorFromDimensions, measureOf, type Dimension } from './dimensions';
import { roundGuaranies } from './money';
import { qty } from './quantity';

export interface PresentationForm {
  name: string;
  unitCode: number;
  factor: number;
  length: number;
  width: number;
  height: number;
  salePrice: number;
}

export function emptyPresentationForm(): PresentationForm {
  return { name: '', unitCode: 77, factor: 0, length: 0, width: 0, height: 0, salePrice: 0 };
}

export function presentationToForm(p: ProductPresentation): PresentationForm {
  return {
    name: p.name,
    unitCode: p.unitCode,
    factor: p.factor,
    length: p.length ?? 0,
    width: p.width ?? 0,
    height: p.height ?? 0,
    salePrice: p.salePrice,
  };
}

/** Lo que lleva la presentación: de las medidas si el producto se mide. */
export function formFactor(form: PresentationForm, productUnitCode: number): Decimal | null {
  if (measureOf(productUnitCode)) return factorFromDimensions(productUnitCode, form);
  return form.factor > 0 ? qty(form.factor) : null;
}

/** Precio de referencia: el de la unidad por lo que lleva la presentación. */
export function suggestedPrice(basePrice: number | null | undefined, factor: Decimal | null): number | null {
  if (!basePrice || !factor) return null;
  return roundGuaranies(qty(basePrice).mul(factor)).toNumber();
}

/** Problema del formulario, o null si se puede guardar. */
export function presentationFormError(form: PresentationForm, productUnitCode: number): string | null {
  if (!form.name.trim()) return 'Poné un nombre a la presentación';
  const measure = measureOf(productUnitCode);
  if (measure) {
    const missing = measure.dimensions.find((d) => !(form[d] > 0));
    if (missing) return `Falta ${MISSING[missing]}`;
  } else if (!(form.factor > 0)) {
    return 'Indicá cuánto del producto lleva';
  }
  if (!(form.salePrice > 0)) return 'Poné el precio de la presentación';
  return null;
}

const MISSING: Record<Dimension, string> = { length: 'el largo', width: 'el ancho', height: 'el alto' };

/** Solo las medidas que pide la unidad del producto, o el factor si no se mide. */
export function presentationPayload(
  form: PresentationForm,
  productUnitCode: number,
): ProductPresentationPayload {
  const base = { name: form.name.trim(), unitCode: form.unitCode, salePrice: form.salePrice };
  const measure = measureOf(productUnitCode);
  if (!measure) return { ...base, factor: form.factor };
  return {
    ...base,
    ...Object.fromEntries(measure.dimensions.map((d) => [d, form[d]])),
  };
}
