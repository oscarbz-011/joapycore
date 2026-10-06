import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';
import {
  stockDemandKey,
  type StockDemand,
} from '../../../common/utils/stock-availability.util';

/**
 * Escrituras y lecturas puntuales de stock_movements usadas por los flujos de
 * stock (ventas, compras, producción, anulaciones). Los listados y el stock
 * por producto siguen en ProductsRepository.
 */
@Injectable()
export class StockMovementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.StockMovementUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.stockMovement.create({ data });
  }

  delete(id: string, client: PrismaClientOrTx = this.prisma) {
    return client.stockMovement.delete({ where: { id } });
  }

  /** ¿Existe algún movimiento que cumpla el filtro? (chequeos de idempotencia) */
  async exists(
    where: Prisma.StockMovementWhereInput,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<boolean> {
    const row = await client.stockMovement.findFirst({
      where,
      select: { id: true },
    });
    return row !== null;
  }

  /** OUT combinado (sin lote) que Ventas creó para una línea. */
  findUnbatchedOut(
    tenantId: string,
    productId: string,
    referenceId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.stockMovement.findFirst({
      where: { tenantId, productId, referenceId, type: 'OUT', batchId: null },
    });
  }

  /**
   * Bloquea los productos hasta el fin de la transacción (advisory lock por
   * producto, en orden fijo para no generar deadlocks).
   */
  async lockProducts(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productIds: string[],
  ): Promise<void> {
    for (const productId of [...productIds].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stock:${tenantId}:${productId}`}, 0))`;
    }
  }

  /** Stock disponible = suma de todos los movimientos de cada producto. */
  async sumByProducts(
    tenantId: string,
    productIds: string[],
    client: PrismaClientOrTx = this.prisma,
  ): Promise<Map<string, number>> {
    const sums = await client.stockMovement.groupBy({
      by: ['productId'],
      where: { tenantId, productId: { in: productIds } },
      _sum: { quantity: true },
    });
    return new Map(sums.map((s) => [s.productId, s._sum.quantity ?? 0]));
  }

  /** Saldo de movimientos sin depósito asignado (puede ser negativo). */
  async sumUnlocated(
    tenantId: string,
    productId: string,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<number> {
    const result = await client.stockMovement.aggregate({
      where: { tenantId, productId, warehouseId: null },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  async sumByProductsAndWarehouse(
    tenantId: string,
    demands: StockDemand[],
    client: PrismaClientOrTx = this.prisma,
  ): Promise<Map<string, number>> {
    if (demands.length === 0) return new Map();
    const pairs = [
      ...new Map(
        demands.map((d) => [
          stockDemandKey(d.productId, d.warehouseId),
          { productId: d.productId, warehouseId: d.warehouseId },
        ]),
      ).values(),
    ];
    const sums = await client.stockMovement.groupBy({
      by: ['productId', 'warehouseId'],
      where: {
        tenantId,
        OR: pairs,
      },
      _sum: { quantity: true },
    });
    return new Map(
      sums
        .filter((sum) => sum.warehouseId)
        .map((sum) => [
          stockDemandKey(sum.productId, sum.warehouseId!),
          sum._sum.quantity ?? 0,
        ]),
    );
  }

  /** Suma de movimientos RESERVED por ítem de venta. */
  async sumReservationsByReference(
    tenantId: string,
    referenceIds: string[],
    client: PrismaClientOrTx = this.prisma,
  ): Promise<Map<string, number>> {
    const sums = await client.stockMovement.groupBy({
      by: ['referenceId'],
      where: { tenantId, type: 'RESERVED', referenceId: { in: referenceIds } },
      _sum: { quantity: true },
    });
    return new Map(
      sums
        .filter((s) => s.referenceId)
        .map((s) => [s.referenceId!, s._sum.quantity ?? 0]),
    );
  }
}
