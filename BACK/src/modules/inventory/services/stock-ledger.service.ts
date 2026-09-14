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
  aggregateDemands,
  assertDemandsCovered,
  type StockDemand,
} from '../../../common/utils/stock-availability.util';
import { ProductUnitsRepository } from '../repositories/product-units.repository';
import { StockMovementsRepository } from '../repositories/stock-movements.repository';

/**
 * Implementación de StockLedger: operaciones de stock que Ventas y POS usan
 * por el token STOCK_LEDGER, siempre dentro de la transacción del llamador.
 */
@Injectable()
export class StockLedgerService implements StockLedger {
  constructor(
    private readonly stockMovements: StockMovementsRepository,
    private readonly productUnits: ProductUnitsRepository,
  ) {}

  /**
   * Disponible = suma de todos los movimientos del producto (incluye RESERVED,
   * que resta), el mismo cálculo que muestra el inventario. El lock por
   * producto serializa las ventas concurrentes: sin él, dos ventas simultáneas
   * de la última unidad leen "1 disponible" y pasan las dos. Solo aplica a no
   * serializados; los serializados se controlan por unidad (IN_STOCK).
   */
  async assertAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    demands: StockDemand[],
  ): Promise<void> {
    const totals = aggregateDemands(demands);
    if (totals.size === 0) return;
    const productIds = [...totals.keys()];
    await this.stockMovements.lockProducts(tx, tenantId, productIds);
    const available = await this.stockMovements.sumByProducts(
      tenantId,
      productIds,
      tx,
    );
    assertDemandsCovered(totals, available);
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
    const sums = await this.stockMovements.sumReservationsByReference(
      tenantId,
      itemIds,
      tx,
    );
    return new Map(
      [...sums.entries()].filter(([, q]) => q < 0).map(([id, q]) => [id, -q]),
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
      await this.stockMovements.create(
        {
          tenantId,
          productId: item.productId,
          warehouseId: item.warehouseId ?? null,
          type: 'RESERVED',
          quantity, // positive = reverses the reservation
          referenceId: item.id,
        },
        tx,
      );
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
      const unit = await this.productUnits.findBySerialForUpdate(
        tenantId,
        productId,
        serial,
        tx,
      );
      if (!unit) {
        throw new NotFoundException(`Serial number "${serial}" not found`);
      }
      if (unit.status !== 'IN_STOCK') {
        throw new UnprocessableEntityException(
          `Serial "${serial}" is not available (status: ${unit.status})`,
        );
      }
      await this.productUnits.assignToSaleItem(unit.id, saleItemId, tx);
    }
  }

  async detachSerialUnits(
    tx: Prisma.TransactionClient,
    saleItemIds: string[],
  ): Promise<void> {
    if (saleItemIds.length === 0) return;
    await this.productUnits.detachFromSaleItems(saleItemIds, tx);
  }

  async markSerialUnitsSold(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleItemId: string,
  ): Promise<void> {
    await this.productUnits.markSoldBySaleItem(tenantId, saleItemId, tx);
  }

  private async writeMovements(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lines: StockLine[],
    type: 'RESERVED' | 'OUT',
  ): Promise<void> {
    for (const line of lines) {
      if (!line.productId) continue; // free-text / service lines never touch stock
      await this.stockMovements.create(
        {
          tenantId,
          productId: line.productId,
          warehouseId: line.warehouseId,
          type,
          quantity: -line.quantity,
          referenceId: line.saleItemId,
        },
        tx,
      );
    }
  }
}
