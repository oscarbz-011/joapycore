import { UnprocessableEntityException } from '@nestjs/common';

export interface StockDemand {
  productId: string;
  quantity: number;
  /** Nombre para el mensaje de error; si falta se muestra el id. */
  name?: string;
}

export interface AggregatedDemand {
  quantity: number;
  name?: string;
}

/** Suma las cantidades pedidas por producto (ignora cantidades ≤ 0). */
export function aggregateDemands(
  demands: StockDemand[],
): Map<string, AggregatedDemand> {
  const totals = new Map<string, AggregatedDemand>();
  for (const d of demands) {
    if (d.quantity <= 0) continue;
    const entry = totals.get(d.productId) ?? { quantity: 0, name: d.name };
    entry.quantity += d.quantity;
    totals.set(d.productId, entry);
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
  available: Map<string, number>,
): void {
  const missing = [...totals.keys()]
    .sort()
    .map((productId) => {
      const { quantity, name } = totals.get(productId)!;
      const have = available.get(productId) ?? 0;
      return have < quantity
        ? `${name ?? productId} (disponible ${Math.max(have, 0)}, pedido ${quantity})`
        : null;
    })
    .filter((m): m is string => m !== null);

  if (missing.length > 0) {
    throw new UnprocessableEntityException(
      `No hay stock suficiente de: ${missing.join('; ')}`,
    );
  }
}
