import { Industry, ProductKind } from '@prisma/client';

// Con qué tipo nace un producto según el rubro del tenant. Es solo el DEFAULT
// del formulario: la clasificación es por producto y siempre se puede cambiar
// (una mueblería también revende colchones, una ferretería puede armar kits).
//
// MUEBLERIA arranca en MANUFACTURED porque lo que vende una carpintería lo
// fabrica ella; la materia prima que compra se marca a mano como RAW_MATERIAL.
// El resto de los rubros revende, que es el caso mayoritario.
export const INDUSTRY_DEFAULT_KIND: Record<Industry, ProductKind> = {
  ELECTRODOMESTICOS: ProductKind.RESALE,
  FERRETERIA: ProductKind.RESALE,
  SUPERMERCADO: ProductKind.RESALE,
  MUEBLERIA: ProductKind.MANUFACTURED,
  SERVICIOS: ProductKind.RESALE,
  OTRO: ProductKind.RESALE,
};

export const DEFAULT_PRODUCT_KIND = ProductKind.RESALE;

export function defaultKindForIndustry(
  industry: Industry | null | undefined,
): ProductKind {
  return industry ? INDUSTRY_DEFAULT_KIND[industry] : DEFAULT_PRODUCT_KIND;
}

// En qué flujos participa cada tipo, por defecto. Son los valores iniciales de
// `isPurchasable`/`isSellable`; quedan editables por producto porque los casos
// mixtos son reales (un tornillo que es materia prima de un mueble y además se
// vende suelto en el mostrador).
export const KIND_DEFAULT_FLAGS: Record<
  ProductKind,
  { isPurchasable: boolean; isSellable: boolean }
> = {
  // Se compra terminado y se vende tal cual.
  RESALE: { isPurchasable: true, isSellable: true },
  // Se compra para consumir en producción — no va al mostrador.
  RAW_MATERIAL: { isPurchasable: true, isSellable: false },
  // Sale de una orden de producción, no de un proveedor.
  MANUFACTURED: { isPurchasable: false, isSellable: true },
};
