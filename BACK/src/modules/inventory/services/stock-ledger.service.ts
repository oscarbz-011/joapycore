import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AvailableStock,
  ReservedItem,
  ReturnableItem,
  ReturnLine,
  StockLedger,
  StockDispatch,
  StockLine,
  StockReception,
  TransferLine,
} from '../../../common/contracts/stock-ledger.contract';
import {
  aggregateDemands,
  assertDemandsCovered,
  type StockDemand,
} from '../../../common/utils/stock-availability.util';
import { ProductUnitsRepository } from '../repositories/product-units.repository';
import { ProductsRepository } from '../repositories/products.repository';
import { StockMovementsRepository } from '../repositories/stock-movements.repository';
import { StockLocationsRepository } from '../repositories/stock-locations.repository';
import { StockSourcesRepository } from '../repositories/stock-sources.repository';

/**
 * Implementación de StockLedger: operaciones de stock que Ventas y POS usan
 * por el token STOCK_LEDGER, siempre dentro de la transacción del llamador.
 */
@Injectable()
export class StockLedgerService implements StockLedger {
  constructor(
    private readonly stockMovements: StockMovementsRepository,
    private readonly productUnits: ProductUnitsRepository,
    private readonly stockLocations: StockLocationsRepository,
    private readonly stockSources: StockSourcesRepository,
    private readonly products: ProductsRepository,
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
    for (const warehouseId of new Set(
      demands.map((demand) => demand.warehouseId),
    )) {
      await this.assertActiveWarehouse(tx, tenantId, warehouseId);
    }
    const productIds = [
      ...new Set([...totals.values()].map((demand) => demand.productId)),
    ];
    await this.stockMovements.lockProducts(tx, tenantId, productIds);
    const available = await this.stockMovements.sumByProductsAndWarehouse(
      tenantId,
      demands,
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
    warehouseId: string,
  ): Promise<void> {
    await this.assertActiveWarehouse(tx, tenantId, warehouseId);
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
      if (unit.warehouseId !== warehouseId) {
        throw new UnprocessableEntityException(
          `Serial "${serial}" is not available in warehouse ${warehouseId}`,
        );
      }
      await this.productUnits.assignToSaleItem(unit.id, saleItemId, tx);
    }
  }

  private async assertActiveWarehouse(
    tx: Prisma.TransactionClient,
    tenantId: string,
    warehouseId: string,
  ): Promise<void> {
    const warehouse = await this.stockLocations.findById(
      tenantId,
      warehouseId,
      tx,
    );
    if (!warehouse?.isActive) {
      throw new UnprocessableEntityException(
        'El depósito no existe o está inactivo',
      );
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

  async findReturnable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleItemIds: string[],
  ): Promise<Map<string, ReturnableItem>> {
    const result = new Map<string, ReturnableItem>();
    if (saleItemIds.length === 0) return result;
    const [items, units] = await Promise.all([
      this.stockSources.findSaleItemsForReturn(tenantId, saleItemIds, tx),
      this.productUnits.findSoldBySaleItems(tenantId, saleItemIds, tx),
    ]);
    for (const item of items) {
      result.set(item.id, {
        stocked: item.productId !== null,
        isSerialized: Boolean(item.product?.isSerialized),
        soldSerials: units
          .filter((u) => u.saleOrderItemId === item.id)
          .map((u) => u.serialNumber),
      });
    }
    return result;
  }

  async restockReturn(
    tx: Prisma.TransactionClient,
    tenantId: string,
    referenceId: string,
    lines: ReturnLine[],
  ): Promise<void> {
    const wanted = lines.filter((l) => l.quantity > 0);
    if (wanted.length === 0) return;
    const items = await this.stockSources.findSaleItemsForReturn(
      tenantId,
      wanted.map((l) => l.saleItemId),
      tx,
    );
    const byId = new Map(items.map((i) => [i.id, i]));

    for (const line of wanted) {
      const item = byId.get(line.saleItemId);
      if (!item?.productId) {
        throw new UnprocessableEntityException(
          'Uno de los ítems devueltos no mueve stock',
        );
      }
      if (item.product?.isSerialized) {
        if (line.serialNumbers.length !== line.quantity) {
          throw new UnprocessableEntityException(
            'Elegí un número de serie por cada unidad que vuelve al stock',
          );
        }
        const restored = await this.productUnits.restoreSoldSerials(
          tenantId,
          item.id,
          line.serialNumbers,
          tx,
        );
        if (restored !== line.quantity) {
          throw new UnprocessableEntityException(
            'Algún número de serie no corresponde a esta venta o ya volvió al stock',
          );
        }
        continue;
      }
      await this.stockMovements.create(
        {
          tenantId,
          productId: item.productId,
          warehouseId: item.warehouseId,
          type: 'IN',
          reason: 'CUSTOMER_RETURN',
          quantity: line.quantity,
          referenceId,
        },
        tx,
      );
    }
  }

  async dispatch(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dispatch: StockDispatch,
  ): Promise<void> {
    const { fromWarehouseId, toWarehouseId } = dispatch;
    if (fromWarehouseId === toWarehouseId) {
      throw new UnprocessableEntityException(
        'Los depósitos de origen y destino deben ser distintos',
      );
    }
    await this.assertActiveWarehouse(tx, tenantId, fromWarehouseId);
    await this.assertActiveWarehouse(tx, tenantId, toWarehouseId);

    const lines = dispatch.lines.filter((l) => l.quantity > 0);
    if (lines.length === 0) {
      throw new UnprocessableEntityException('El traslado no tiene mercadería');
    }
    const byId = await this.productsOf(tx, tenantId, lines);

    const counted = lines.filter((l) => !byId.get(l.productId)?.isSerialized);
    if (counted.length > 0) {
      const demands: StockDemand[] = counted.map((l) => ({
        productId: l.productId,
        warehouseId: fromWarehouseId,
        quantity: l.quantity,
        name: byId.get(l.productId)?.name ?? '',
      }));
      await this.stockMovements.lockProducts(
        tx,
        tenantId,
        demands.map((d) => d.productId),
      );
      const available = await this.stockMovements.sumByProductsAndWarehouse(
        tenantId,
        demands,
        tx,
      );
      assertDemandsCovered(aggregateDemands(demands), available);
    }

    for (const line of lines) {
      const product = byId.get(line.productId);
      if (product?.isSerialized) {
        const serials = this.uniqueSerials(line, product.name);
        const moved = await this.productUnits.dispatchUnits(
          tenantId,
          line.productId,
          serials,
          fromWarehouseId,
          toWarehouseId,
          tx,
        );
        if (moved !== line.quantity) {
          throw new UnprocessableEntityException(
            `Algún número de serie de ${product.name} no está disponible en el depósito de origen`,
          );
        }
      }
      await this.stockMovements.create(
        {
          tenantId,
          productId: line.productId,
          warehouseId: fromWarehouseId,
          type: 'OUT',
          reason: 'TRANSFER',
          quantity: -line.quantity,
          referenceId: dispatch.referenceId,
          notes: dispatch.notes,
        },
        tx,
      );
    }
  }

  async receive(
    tx: Prisma.TransactionClient,
    tenantId: string,
    reception: StockReception,
  ): Promise<void> {
    await this.assertActiveWarehouse(tx, tenantId, reception.warehouseId);
    const lines = reception.lines.filter((l) => l.quantity > 0);
    const lost = reception.lostSerials.filter(
      (l) => l.serialNumbers.length > 0,
    );
    const byId = await this.productsOf(tx, tenantId, [
      ...lines,
      ...lost.map((l) => ({ productId: l.productId })),
    ]);

    for (const line of lines) {
      const product = byId.get(line.productId);
      if (product?.isSerialized) {
        const serials = this.uniqueSerials(line, product.name);
        const received = await this.productUnits.receiveUnits(
          tenantId,
          line.productId,
          serials,
          reception.warehouseId,
          tx,
        );
        if (received !== line.quantity) {
          throw new UnprocessableEntityException(
            `Algún número de serie de ${product.name} no está en tránsito`,
          );
        }
      }
      await this.stockMovements.create(
        {
          tenantId,
          productId: line.productId,
          warehouseId: reception.warehouseId,
          type: 'IN',
          reason: 'TRANSFER',
          quantity: line.quantity,
          referenceId: reception.referenceId,
          notes: reception.notes,
        },
        tx,
      );
    }

    for (const missing of lost) {
      const count = await this.productUnits.loseInTransit(
        tenantId,
        missing.productId,
        missing.serialNumbers,
        tx,
      );
      if (count !== missing.serialNumbers.length) {
        throw new UnprocessableEntityException(
          'Algún número de serie faltante no está en tránsito',
        );
      }
    }
  }

  private async productsOf(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lines: { productId: string }[],
  ) {
    const ids = [...new Set(lines.map((l) => l.productId))];
    const products =
      ids.length > 0
        ? await this.products.findForTransfer(tenantId, ids, tx)
        : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    if (ids.some((id) => !byId.has(id))) {
      throw new NotFoundException('Uno de los productos no existe');
    }
    return byId;
  }

  private uniqueSerials(line: TransferLine, name: string): string[] {
    const serials = [...new Set(line.serialNumbers)];
    if (serials.length !== line.quantity) {
      throw new UnprocessableEntityException(
        `Elegí un número de serie por cada unidad de ${name}`,
      );
    }
    return serials;
  }

  async availableIn(
    tx: Prisma.TransactionClient,
    tenantId: string,
    warehouseId: string,
  ): Promise<AvailableStock[]> {
    const [balances, units] = await Promise.all([
      this.stockMovements.sumByWarehouse(tenantId, warehouseId, tx),
      this.productUnits.findFreeInWarehouse(tenantId, warehouseId, tx),
    ]);
    const serials = new Map<string, string[]>();
    for (const unit of units) {
      serials.set(unit.productId, [
        ...(serials.get(unit.productId) ?? []),
        unit.serialNumber,
      ]);
    }
    return [...balances]
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({
        productId,
        quantity,
        serialNumbers: serials.get(productId) ?? [],
      }));
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
