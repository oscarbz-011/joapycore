import Decimal from "decimal.js";

// Las mismas fórmulas que BACK/src/common/money: lo que la pantalla estima
// tiene que ser exactamente lo que después se guarda y se factura.

export type MoneyValue = Decimal.Value;

const ZERO = new Decimal(0);

export function money(value: MoneyValue | null | undefined): Decimal {
  return value == null || value === "" ? ZERO : new Decimal(value);
}

/** Los montos en guaraníes son enteros; el medio redondea hacia arriba. */
export function roundGuaranies(value: MoneyValue): Decimal {
  return money(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

export function sumMoney(values: readonly MoneyValue[]): Decimal {
  return values.reduce<Decimal>((sum, value) => sum.plus(money(value)), ZERO);
}

/** Cuotas exactas al guaraní: la diferencia va en la primera. */
export function splitInstallments(total: MoneyValue, count: number): Decimal[] {
  if (!Number.isInteger(count) || count < 1) return [];
  const whole = roundGuaranies(total);
  const base = whole.divToInt(count);
  const remainder = whole.minus(base.mul(count));
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? base.plus(remainder) : base,
  );
}

function interestFactor(interestRate: MoneyValue | null | undefined): Decimal {
  return new Decimal(1).plus(money(interestRate).div(100));
}

export function chargedUnitPrice(
  unitPrice: MoneyValue,
  interestRate?: MoneyValue | null,
): Decimal {
  return roundGuaranies(money(unitPrice).mul(interestFactor(interestRate)));
}

export interface SaleLine {
  unitPrice: MoneyValue;
  quantity: number;
}

export interface Surcharge {
  type: "FIXED" | "PERCENTAGE" | string | null | undefined;
  amount: MoneyValue | null | undefined;
}

export function saleAmounts(input: {
  lines: readonly SaleLine[];
  surcharge?: Surcharge | null;
  interestRate?: MoneyValue | null;
}) {
  const lines = input.lines.map((line) => {
    const unitPrice = chargedUnitPrice(line.unitPrice, input.interestRate);
    return { unitPrice, total: unitPrice.mul(line.quantity) };
  });
  const subtotal = sumMoney(lines.map((l) => l.total));

  let surcharge = ZERO;
  const amount = money(input.surcharge?.amount);
  if (!amount.isZero()) {
    const cashBase = sumMoney(
      input.lines.map((l) => money(l.unitPrice).mul(l.quantity)),
    );
    const cashSurcharge =
      input.surcharge?.type === "FIXED" ? amount : cashBase.mul(amount).div(100);
    surcharge = roundGuaranies(
      cashSurcharge.mul(interestFactor(input.interestRate)),
    );
  }

  return { lines, subtotal, surcharge, total: subtotal.plus(surcharge) };
}

/** Primera cuota (con la diferencia del reparto) y las demás, para mostrar. */
export function installmentPlan(total: MoneyValue, count: number) {
  const parts = splitInstallments(total, count);
  if (parts.length === 0) return null;
  return {
    count,
    first: parts[0].toNumber(),
    rest: parts.length > 1 ? parts[1].toNumber() : null,
  };
}
