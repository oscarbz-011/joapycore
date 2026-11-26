import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { unitOfMeasure } from './units-of-measure';

export type Quantity = Prisma.Decimal;
export type QuantityValue = Prisma.Decimal | number | string;

const Decimal = Prisma.Decimal;
const ZERO = new Decimal(0);

/** Cantidades: exactas como los montos, nunca con float. */
export function qty(value: QuantityValue | null | undefined): Quantity {
  if (value == null) return ZERO;
  return value instanceof Decimal ? value : new Decimal(value.toString());
}

export function sumQty(values: readonly QuantityValue[]): Quantity {
  return values.reduce<Quantity>((sum, value) => sum.plus(qty(value)), ZERO);
}

/** Lo que falta para llegar a `total`, nunca negativo. */
export function remainingQty(
  total: QuantityValue,
  done: QuantityValue,
): Quantity {
  return Decimal.max(qty(total).minus(qty(done)), ZERO);
}

/**
 * Una cantidad tiene que ser positiva y respetar su unidad: lo que se cuenta
 * (unidades, cajas) va entero, lo que se mide (kg, m²) admite 3 decimales, y
 * un producto con número de serie siempre va por unidad entera.
 */
export function assertQuantityForUnit(
  value: QuantityValue,
  product: { name: string; unitCode: number; isSerialized?: boolean },
): Quantity {
  const quantity = qty(value);
  if (quantity.lte(0)) {
    throw new UnprocessableEntityException(
      `La cantidad de "${product.name}" tiene que ser mayor que cero`,
    );
  }
  return assertDecimalsForUnit(quantity, product);
}

/** Solo los decimales: cero vale (ej. un componente que no se usó). */
export function assertDecimalsForUnit(
  value: QuantityValue,
  product: { name: string; unitCode: number; isSerialized?: boolean },
): Quantity {
  const quantity = qty(value);
  const decimals = product.isSerialized
    ? 0
    : unitOfMeasure(product.unitCode).decimals;
  if (quantity.decimalPlaces() > decimals) {
    throw new UnprocessableEntityException(
      decimals === 0
        ? `"${product.name}" se cuenta por unidad entera: no admite ${quantity.toString()}`
        : `"${product.name}" admite hasta ${decimals} decimales: ${quantity.toString()} tiene más`,
    );
  }
  return quantity;
}
