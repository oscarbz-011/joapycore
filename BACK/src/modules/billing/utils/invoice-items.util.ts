type Numeric = number | { toNumber(): number };

export function toNum(value: Numeric): number {
  return typeof value === 'object' ? value.toNumber() : value;
}

// Precio con interés ya aplicado cuando existe (ventas a crédito) — cae al
// precio contado para ventas al contado o ítems de ventas a crédito creados
// antes de que este campo existiera.
export function effectiveUnitPrice(item: {
  unitPrice: Numeric;
  financedUnitPrice?: Numeric | null;
}): number {
  return item.financedUnitPrice != null
    ? toNum(item.financedUnitPrice)
    : toNum(item.unitPrice);
}

// Un ítem cargado a mano, sin producto, tributa la tasa general.
const DEFAULT_IVA_RATE = 10;

export interface SaleItemForInvoice {
  quantity: number;
  unitPrice: Numeric;
  financedUnitPrice?: Numeric | null;
  description?: string | null;
  product?: { name: string; ivaTaxRate: Numeric } | null;
}

/**
 * Ítem de factura con el IVA incluido en el precio desglosado (art. 20 del
 * Decreto 6539/05): el precio cobrado ya trae el impuesto.
 */
export function toInvoiceItem(item: SaleItemForInvoice) {
  const unitPrice = effectiveUnitPrice(item);
  const total = unitPrice * item.quantity;
  const ivaRate = item.product
    ? toNum(item.product.ivaTaxRate)
    : DEFAULT_IVA_RATE;
  const ivaAmount = Math.round((total * ivaRate) / (100 + ivaRate));
  return {
    description: item.product?.name ?? item.description ?? 'Ítem',
    quantity: item.quantity,
    unitPrice,
    total,
    ivaRate,
    ivaAmount,
    unitPriceWithoutIva: Math.round((unitPrice * 100) / (100 + ivaRate)),
  };
}
