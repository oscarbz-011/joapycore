import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { qty, type Quantity, type QuantityValue } from '../units/quantity';

export interface StockDemand {
  productId: string;
  warehouseId: string;
  quantity: QuantityValue;
  /** Nombre para el mensaje de error; si falta se muestra el id. */
  name?: string;
}

export interface AggregatedDemand {
  productId: string;
  warehouseId: string;
  quantity: Quantity;
  name?: string;
}

export function stockDemandKey(productId: string, warehouseId: string): string {
  return `${productId}::${warehouseId}`;
}

/** Suma cantidades por producto y depósito (ignora cantidades ≤ 0). */
export function aggregateDemands(
  demands: StockDemand[],
): Map<string, AggregatedDemand> {
  const totals = new Map<string, AggregatedDemand>();
  for (const d of demands) {
    const quantity = qty(d.quantity);
    if (quantity.lte(0)) continue;
    const key = stockDemandKey(d.productId, d.warehouseId);
    const entry = totals.get(key) ?? {
      productId: d.productId,
      warehouseId: d.warehouseId,
      quantity: qty(0),
      name: d.name,
    };
    entry.quantity = entry.quantity.plus(quantity);
    totals.set(key, entry);
  }
  return totals;
}

/**
 * Compara lo pedido contra lo disponible y lanza 422 con el detalle de cada
 * producto que no alcanza. Lógica pura: el bloqueo y la lectura del stock los
 * hace StockLedgerService (Inventario) dentro de la transacción.
 */
export function assertDemandsCovered(
  totals: Map<string, AggregatedDemand>,
  available: ReadonlyMap<string, QuantityValue>,
): void {
  const missing = [...totals.keys()]
    .sort()
    .map((productId) => {
      const { quantity, name } = totals.get(productId)!;
      const have = qty(available.get(productId));
      return have.lt(quantity)
        ? `${name ?? productId} (disponible ${Prisma.Decimal.max(have, 0).toString()}, pedido ${quantity.toString()})`
        : null;
    })
    .filter((m): m is string => m !== null);

  if (missing.length > 0) {
    throw new UnprocessableEntityException(
      `No hay stock suficiente de: ${missing.join('; ')}`,
    );
  }
}
