import type { QuantityValue } from '../units/quantity';
import {
  money,
  roundGuaranies,
  sumMoney,
  type Money,
  type MoneyValue,
} from './money';

export interface SaleLine {
  unitPrice: MoneyValue;
  quantity: QuantityValue;
}

export interface Surcharge {
  /** 'FIXED' o 'PERCENTAGE', como MarkupType. */
  type: string | null;
  amount: MoneyValue | null;
}

export interface SaleAmounts {
  /** Precio cobrado por unidad: con el interés incluido si es a crédito. */
  lines: { unitPrice: Money; total: Money }[];
  /** El recargo de entrega o zona cobrado, también con interés a crédito. */
  surcharge: Money;
  /** Suma de las líneas y el recargo: el total de la factura y del préstamo. */
  total: Money;
}

function interestFactor(interestRate: MoneyValue | null | undefined): Money {
  return money(1).plus(money(interestRate).div(100));
}

/** El precio contado o con el interés del crédito, en guaraníes enteros. */
export function chargedUnitPrice(
  unitPrice: MoneyValue,
  interestRate?: MoneyValue | null,
): Money {
  return roundGuaranies(money(unitPrice).mul(interestFactor(interestRate)));
}

/**
 * Una sola fórmula para el pedido, el préstamo y la factura: así la suma de
 * las líneas es el total, y a crédito coincide con la suma de las cuotas.
 */
export function saleAmounts(input: {
  lines: readonly SaleLine[];
  surcharge?: Surcharge | null;
  interestRate?: MoneyValue | null;
}): SaleAmounts {
  const factor = interestFactor(input.interestRate);
  const lines = input.lines.map((line) => {
    const unitPrice = chargedUnitPrice(line.unitPrice, input.interestRate);
    return { unitPrice, total: unitPrice.mul(line.quantity) };
  });

  let surcharge = money(0);
  const amount = input.surcharge?.amount;
  if (amount != null && !money(amount).isZero()) {
    const cashBase = sumMoney(
      input.lines.map((l) => money(l.unitPrice).mul(l.quantity)),
    );
    const cashSurcharge =
      input.surcharge?.type === 'FIXED'
        ? money(amount)
        : cashBase.mul(money(amount)).div(100);
    surcharge = roundGuaranies(cashSurcharge.mul(factor));
  }

  return {
    lines,
    surcharge,
    total: sumMoney([...lines.map((l) => l.total), surcharge]),
  };
}
