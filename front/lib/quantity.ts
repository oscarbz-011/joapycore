import Decimal from 'decimal.js';
import { unitOfMeasure } from './units-of-measure';

/** La API manda las cantidades como texto exacto ("2.375"); el form, como número. */
export type QuantityValue = string | number;

export function qty(value: QuantityValue | Decimal | null | undefined): Decimal {
  if (value == null || value === '') return new Decimal(0);
  return new Decimal(value);
}

export function sumQty(values: readonly (QuantityValue | Decimal)[]): Decimal {
  return values.reduce<Decimal>((sum, value) => sum.plus(qty(value)), new Decimal(0));
}

/** "2,375" — sin ceros de más y con la coma de Paraguay. */
export function formatQty(
  value: QuantityValue | Decimal | null | undefined,
  maxDecimals = 3,
): string {
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: maxDecimals }).format(
    qty(value).toNumber(),
  );
}

/** Decimales que admite el input de cantidad de un producto (0 o 3). */
export function quantityDecimals(
  product: { unitCode?: number | null; isSerialized?: boolean } | null | undefined,
): number {
  if (!product || product.isSerialized || product.unitCode == null) return 0;
  return unitOfMeasure(product.unitCode).decimals;
}

/** Paso del input numérico: 1 para lo que se cuenta, 0,001 para lo que se mide. */
export function quantityStep(unitCode: number, isSerialized = false): number {
  return isSerialized || unitOfMeasure(unitCode).decimals === 0 ? 1 : 0.001;
}

/** Mensaje de error si la cantidad no respeta la unidad, o null si está bien. */
export function quantityError(
  value: QuantityValue,
  product: { name: string; unitCode: number; isSerialized?: boolean },
): string | null {
  const quantity = qty(value);
  if (quantity.lte(0)) return `La cantidad de "${product.name}" tiene que ser mayor que cero`;
  const decimals = product.isSerialized ? 0 : unitOfMeasure(product.unitCode).decimals;
  if (quantity.decimalPlaces() > decimals) {
    return decimals === 0
      ? `"${product.name}" se cuenta por unidad entera`
      : `"${product.name}" admite hasta ${decimals} decimales`;
  }
  return null;
}
