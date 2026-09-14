import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ReservedItem,
  StockLedger,
  StockLine,
} from '../../../common/contracts/stock-ledger.contract';
import {
  assertStockAvailable,
  type StockDemand,
} from '../../../common/utils/stock-availability.util';

/**
 * Implementación de StockLedger: único lugar fuera de los listeners de
 * Inventario que escribe stock_movements y product_units. Ventas y POS la
 * usan por el token STOCK_LEDGER, pasando su transacción.
 */
@Injectable()
export class StockLedgerService implements StockLedger {
  assertAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    demands: StockDemand[],
  ): Promise<void> {
    return assertStockAvailable(tx, tenantId, demands);
  }

  reserve(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lines: StockLine[],
  ): Promise<void> {
    return this.writeMovements(tx, tenantId, lines, 'RESERVED');
  }

  consume(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lines: StockLine[],
  ): Promise<void> {
    return this.writeMovements(tx, tenantId, lines, 'OUT');
  }

  // Los movimientos RESERVED de un ítem se crean negativos al reservar y
  // positivos al liberar, así que la suma negativa es la reserva vigente.
  // Decidir por esto y no por el tipo de venta evita liberar dos veces o no
  // liberar nunca cuando el camino de reserva cambia.
  async findActiveReservations(
    tx: Prisma.TransactionClient,
    tenantId: string,
    itemIds: string[],
  ): Promise<Map<string, number>> {
    if (itemIds.length === 0) return new Map();
    const sums = await tx.stockMovement.groupBy({
      by: ['referenceId'],
      where: { tenantId, type: 'RESERVED', referenceId: { in: itemIds } },
      _sum: { quantity: true },
    });
    return new Map(
      sums
        .filter((s) => s.referenceId && (s._sum.quantity ?? 0) < 0)
        .map((s) => [s.referenceId!, -(s._sum.quantity ?? 0)]),
    );
  }

  async releaseReservations(
    tx: Prisma.TransactionClient,
    tenantId: string,
    items: ReservedItem[],
  ): Promise<void> {
    const reserved = await this.findActiveReservations(
      tx,
      tenantId,
      items.filter((i) => i.productId).map((i) => i.id),
    );
    for (const item of items) {
      const quantity = reserved.get(item.id);
      if (!item.productId || !quantity) continue;
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: item.productId,
          warehouseId: item.warehouseId ?? null,
          type: 'RESERVED',
          quantity, // positive = reverses the reservation
          referenceId: item.id,
        },
      });
    }
  }

  async assignSerialUnits(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    serialNumbers: string[],
    saleItemId: string,
  ): Promise<void> {
    for (const serial of serialNumbers) {
      const unit = await tx.productUnit.findFirst({
        where: { tenantId, productId, serialNumber: serial },
      });
      if (!unit) {
        throw new NotFoundException(`Serial number "${serial}" not found`);
      }
      if (unit.status !== 'IN_STOCK') {
        throw new UnprocessableEntityException(
          `Serial "${serial}" is not available (status: ${unit.status})`,
        );
      }
      await tx.productUnit.update({
        where: { id: unit.id },
        data: { saleOrderItemId: saleItemId },
      });
    }
  }

  async detachSerialUnits(
    tx: Prisma.TransactionClient,
    saleItemIds: string[],
  ): Promise<void> {
    if (saleItemIds.length === 0) return;
    await tx.productUnit.updateMany({
      where: { saleOrderItemId: { in: saleItemIds } },
      data: { saleOrderItemId: null },
    });
  }

  async markSerialUnitsSold(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleItemId: string,
  ): Promise<void> {
    await tx.productUnit.updateMany({
      where: { saleOrderItemId: saleItemId, tenantId },
      data: { status: 'SOLD' },
    });
  }

  private async writeMovements(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lines: StockLine[],
    type: 'RESERVED' | 'OUT',
  ): Promise<void> {
    for (const line of lines) {
      if (!line.productId) continue; // free-text / service lines never touch stock
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: line.productId,
          warehouseId: line.warehouseId,
          type,
          quantity: -line.quantity,
          referenceId: line.saleItemId,
        },
      });
    }
  }
}
