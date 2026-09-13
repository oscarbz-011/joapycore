import { UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export interface StockDemand {
  productId: string;
  quantity: number;
  /** Nombre para el mensaje de error; si falta se muestra el id. */
  name?: string;
}

/**
 * Verifica que haya stock disponible para las cantidades pedidas y deja los
 * productos bloqueados hasta que termine la transacción.
 *
 * Disponible = suma de todos los movimientos del producto en el tenant
 * (IN/OUT/ADJUSTMENT/TRANSFER y también RESERVED, que resta), el mismo cálculo
 * que muestra el inventario.
 *
 * El advisory lock por producto (en orden fijo, para no generar deadlocks)
 * serializa las ventas concurrentes del mismo producto: sin él, dos ventas
 * simultáneas de la última unidad leen "1 disponible" y pasan las dos. El lock
 * se libera solo al terminar la transacción, así que la segunda lee el stock
 * ya descontado por la primera.
 *
 * Solo aplica a productos NO serializados: los serializados se controlan por
 * el estado de cada unidad (IN_STOCK).
 */
export async function assertStockAvailable(
  tx: Prisma.TransactionClient,
  tenantId: string,
  demands: StockDemand[],
): Promise<void> {
  const totals = new Map<string, { quantity: number; name?: string }>();
  for (const d of demands) {
    if (d.quantity <= 0) continue;
    const entry = totals.get(d.productId) ?? { quantity: 0, name: d.name };
    entry.quantity += d.quantity;
    totals.set(d.productId, entry);
  }
  if (totals.size === 0) return;

  const productIds = [...totals.keys()].sort();
  for (const productId of productIds) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stock:${tenantId}:${productId}`}, 0))`;
  }

  const sums = await tx.stockMovement.groupBy({
    by: ['productId'],
    where: { tenantId, productId: { in: productIds } },
    _sum: { quantity: true },
  });
  const available = new Map(
    sums.map((s) => [s.productId, s._sum.quantity ?? 0]),
  );

  const missing = productIds
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
