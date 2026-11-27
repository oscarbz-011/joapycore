import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { money, sumMoney, type Money, type MoneyValue } from './money';

// Res. SDCU 1670/2022 (SEDECO) y el grupo F del Manual Técnico de SIFEN: lo
// que se paga en efectivo se redondea hacia abajo al múltiplo de 50, a favor
// del cliente. Lo electrónico va exacto.
const CASH_STEP = 50;

export interface PaymentPart {
  amount: MoneyValue;
  paymentMethod: string;
}

const isCash = (p: PaymentPart) => p.paymentMethod === 'CASH';

const gs = (value: Money) =>
  new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(
    value.toNumber(),
  );

/**
 * Cuánto se descuenta por redondeo (dRedon): solo sobre lo que queda por
 * cobrar en efectivo después de lo electrónico.
 */
export function cashRounding(
  total: MoneyValue,
  payments: readonly PaymentPart[],
): Money {
  if (!payments.some(isCash)) return money(0);
  const electronic = sumMoney(
    payments.filter((p) => !isCash(p)).map((p) => p.amount),
  );
  const cashDue = money(total).minus(electronic);
  if (cashDue.lte(0)) return money(0);
  return cashDue.mod(CASH_STEP).toDecimalPlaces(8, Prisma.Decimal.ROUND_DOWN);
}

/**
 * Lo cobrado tiene que cubrir el total a pagar (el efectivo puede tener
 * vuelto) y lo electrónico no puede pasarse del total. Devuelve el redondeo.
 */
export function assertPaymentsCover(
  total: MoneyValue,
  payments: readonly PaymentPart[],
): Money {
  const electronic = sumMoney(
    payments.filter((p) => !isCash(p)).map((p) => p.amount),
  );
  if (electronic.gt(money(total))) {
    throw new UnprocessableEntityException(
      `Con tarjeta, transferencia o cheque no se puede cobrar más que el total (Gs. ${gs(money(total))})`,
    );
  }
  const rounding = cashRounding(total, payments);
  const due = money(total).minus(rounding);
  const paid = sumMoney(payments.map((p) => p.amount));
  if (paid.lt(due)) {
    throw new UnprocessableEntityException(
      `Faltan Gs. ${gs(due.minus(paid))} por cobrar: el total a pagar es Gs. ${gs(due)}`,
    );
  }
  return rounding;
}

/**
 * Redondeo al emitir una factura de Ventas, que se cobra después por cuentas
 * por cobrar: al contado en efectivo se redondea el total; con otro medio o a
 * crédito va exacto. Sin medio elegido queda lo calculado con los pagos.
 */
export function issueRounding(input: {
  total: MoneyValue;
  current: MoneyValue;
  paymentCondition: 'CASH' | 'CREDIT';
  paymentMethod?: string | null;
}): Money {
  if (input.paymentCondition === 'CREDIT') return money(0);
  if (!input.paymentMethod) return money(input.current);
  return cashRounding(input.total, [
    { amount: input.total, paymentMethod: input.paymentMethod },
  ]);
}
