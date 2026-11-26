import { withSoldAs, type SoldAs } from '../../../common/units/dimensions';
import type { QuantityValue } from '../../../common/units/quantity';
import {
  money,
  roundGuaranies,
  type Money,
  type MoneyValue,
} from '../../../common/money/money';

type Numeric = number | { toNumber(): number };

export function toNum(value: Numeric): number {
  return typeof value === 'object' ? value.toNumber() : value;
}

/**
 * Precio cobrado: con el interés ya aplicado en las ventas a crédito, y en
 * guaraníes enteros (los ítems anteriores a los montos exactos tenían centavos).
 */
export function effectiveUnitPrice(item: {
  unitPrice: MoneyValue;
  financedUnitPrice?: MoneyValue | null;
}): Money {
  return roundGuaranies(item.financedUnitPrice ?? item.unitPrice);
}

// Un ítem cargado a mano, sin producto, tributa la tasa general; el recargo
// de entrega o zona es un servicio y también.
const DEFAULT_IVA_RATE = 10;

export interface SaleItemForInvoice extends SoldAs {
  id?: string;
  quantity: QuantityValue;
  unitPrice: MoneyValue;
  financedUnitPrice?: MoneyValue | null;
  description?: string | null;
  product?: { name: string; ivaTaxRate: MoneyValue; unitCode: number } | null;
}

function withIva(
  description: string,
  quantity: QuantityValue,
  unitPrice: Money,
  ivaRateValue: MoneyValue,
) {
  const ivaRate = money(ivaRateValue);
  const total = unitPrice.mul(quantity);
  const divisor = ivaRate.plus(100);
  return {
    description,
    quantity,
    unitPrice,
    total,
    ivaRate,
    ivaAmount: roundGuaranies(total.mul(ivaRate).div(divisor)),
    unitPriceWithoutIva: roundGuaranies(unitPrice.mul(100).div(divisor)),
  };
}

/**
 * Ítem de factura con el IVA incluido en el precio desglosado (art. 20 del
 * Decreto 6539/05): el precio cobrado ya trae el impuesto.
 */
export function toInvoiceItem(item: SaleItemForInvoice) {
  return {
    ...withIva(
      item.product
        ? withSoldAs(item.product.name, item, item.product.unitCode)
        : (item.description ?? 'Ítem'),
      item.quantity,
      effectiveUnitPrice(item),
      item.product?.ivaTaxRate ?? DEFAULT_IVA_RATE,
    ),
    saleOrderItemId: item.id ?? null,
  };
}

/** Todo lo que se cobra va en la factura: el recargo es una línea más. */
export function surchargeInvoiceItem(amount: Money) {
  return {
    ...withIva('Recargo de entrega', 1, amount, DEFAULT_IVA_RATE),
    saleOrderItemId: null,
  };
}
