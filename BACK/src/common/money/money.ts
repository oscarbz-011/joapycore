import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;
export type MoneyValue = Prisma.Decimal.Value | { toString(): string };

const Decimal = Prisma.Decimal;
const ZERO = new Decimal(0);

export function money(value: MoneyValue | null | undefined): Money {
  if (value == null) return ZERO;
  return value instanceof Decimal ? value : new Decimal(value.toString());
}

/** Los montos en guaraníes son enteros; el medio redondea hacia arriba (y -2,5 a -3). */
export function roundGuaranies(value: MoneyValue): Money {
  return money(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/** Costos de proveedor: pueden tener centavos por unidad. */
export function roundCents(value: MoneyValue): Money {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * En guaraníes no hay montos menores a 1 Gs: el saldo de centavos que dejan
 * los créditos anteriores a los montos exactos no se puede cobrar.
 */
export function isSettledInGuaranies(
  paid: MoneyValue,
  amount: MoneyValue,
): boolean {
  return money(amount).minus(money(paid)).lt(1);
}

export function sumMoney(values: readonly MoneyValue[]): Money {
  return values.reduce<Money>((sum, value) => sum.plus(money(value)), ZERO);
}

/**
 * Reparte un total en cuotas exactas al guaraní que suman el total. La
 * diferencia va en la primera cuota, como en el ejemplo de SIFEN:
 * 100.000 en 3 cuotas = 33.334 / 33.333 / 33.333.
 */
export function splitInstallments(total: MoneyValue, count: number): Money[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Cantidad de cuotas inválida: ${count}`);
  }
  const whole = money(total);
  if (!whole.isInteger()) {
    throw new Error(
      `El total a repartir no es un monto en guaraníes: ${whole.toString()}`,
    );
  }
  const base = whole.divToInt(count);
  const remainder = whole.minus(base.mul(count));
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? base.plus(remainder) : base,
  );
}
