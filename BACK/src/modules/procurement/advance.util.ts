// Anticipo a proveedores: lo que se paga de una orden de compra antes de
// recibir la mercadería. Un proveedor nuevo suele pedirlo, total o parcial,
// para despachar. No es una cuenta por pagar (esa nace al recibir): es plata
// adelantada que se descuenta de las cuentas por pagar de esa orden a medida
// que llega la mercadería.

import { Prisma } from '@prisma/client';
import {
  money,
  roundCents,
  sumMoney,
  type MoneyValue,
} from '../../common/money/money';

/**
 * Cuánto anticipo pide una orden. Manda el monto fijado en la orden; si no
 * hay, el porcentaje habitual del proveedor sobre el total.
 */
export function requiredAdvance(
  orderTotal: MoneyValue,
  rule: { amount?: MoneyValue | null; percent?: MoneyValue | null },
): number {
  if (rule.amount != null) return roundCents(rule.amount).toNumber();
  if (!rule.percent || money(rule.percent).isZero()) return 0;
  return roundCents(
    money(orderTotal).mul(money(rule.percent)).div(100),
  ).toNumber();
}

export interface AdvanceBalance {
  /** Lo que el proveedor pide por adelantado. */
  required: number;
  /** Anticipos pagados. */
  paid: number;
  /** Lo que el proveedor devolvió. */
  refunded: number;
  /** Lo ya descontado de cuentas por pagar de mercadería recibida. */
  applied: number;
  /** Saldo a favor con el proveedor: pagado, sin devolver ni aplicar. */
  available: number;
  /** Lo que falta pagar del anticipo requerido. */
  pending: number;
}

export function advanceBalance(input: {
  required: unknown;
  payments: readonly { kind: string; amount: unknown }[];
  applied: unknown;
}): AdvanceBalance {
  const sum = (kind: string) =>
    roundCents(
      sumMoney(
        input.payments
          .filter((payment) => payment.kind === kind)
          .map((payment) => payment.amount as MoneyValue),
      ),
    );
  const required = roundCents(input.required as MoneyValue);
  const paid = sum('ADVANCE');
  const refunded = sum('ADVANCE_REFUND');
  const applied = roundCents(input.applied as MoneyValue);
  const pending = required.minus(paid.minus(refunded));
  return {
    required: required.toNumber(),
    paid: paid.toNumber(),
    refunded: refunded.toNumber(),
    applied: applied.toNumber(),
    available: paid.minus(refunded).minus(applied).toNumber(),
    pending: pending.isNegative() ? 0 : pending.toNumber(),
  };
}

/** Cuánto del saldo a favor se descuenta de una cuenta por pagar nueva. */
export function advanceToApply(
  available: MoneyValue,
  payableAmount: MoneyValue,
) {
  const amount = Prisma.Decimal.min(money(available), money(payableAmount));
  return amount.isNegative() ? 0 : roundCents(amount).toNumber();
}

export function payableStatusAfterAdvance(
  applied: MoneyValue,
  payableAmount: MoneyValue,
): 'PENDING' | 'PARTIAL' | 'PAID' {
  if (money(applied).lte(0)) return 'PENDING';
  return money(applied).gte(money(payableAmount)) ? 'PAID' : 'PARTIAL';
}
