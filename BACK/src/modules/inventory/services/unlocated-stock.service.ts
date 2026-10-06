import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MovementReason, Prisma, StockMovementType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  aggregateDemands,
  assertDemandsCovered,
} from '../../../common/utils/stock-availability.util';
import { WarehousesRepository } from '../../warehouses/repositories/warehouses.repository';
import { AssignUnlocatedStockDto } from '../dto/assign-unlocated-stock.dto';
import { ProductUnitsRepository } from '../repositories/product-units.repository';
import { ProductsRepository } from '../repositories/products.repository';
import { StockMovementsRepository } from '../repositories/stock-movements.repository';

const DEFAULT_NOTES = 'Regularización de stock sin depósito asignado';

/**
 * Regulariza la existencia histórica "sin depósito asignado": la atribuye a un
 * depósito real con un par de movimientos enlazados, sin cambiar el total.
 *
 * No pasa por el movimiento manual común porque ese exige un depósito de
 * origen activo, y acá el origen es justamente la ausencia de depósito.
 */
@Injectable()
export class UnlocatedStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsRepository: ProductsRepository,
    private readonly productUnitsRepository: ProductUnitsRepository,
    private readonly stockMovementsRepository: StockMovementsRepository,
    private readonly warehousesRepository: WarehousesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async assign(tenantId: string, dto: AssignUnlocatedStockDto) {
    const product = await this.productsRepository.findById(
      tenantId,
      dto.productId,
    );
    if (!product) throw new NotFoundException('Product not found');

    const warehouse = await this.warehousesRepository.findById(
      tenantId,
      dto.warehouseId,
    );
    if (!warehouse?.isActive) {
      throw new UnprocessableEntityException(
        'El depósito no existe o está inactivo',
      );
    }

    const movements = await this.prisma.$transaction(async (tx) => {
      await this.stockMovementsRepository.lockProducts(tx, tenantId, [
        product.id,
      ]);
      const delta = product.isSerialized
        ? await this.locateUnits(tx, tenantId, product, dto)
        : await this.resolveQuantity(tx, tenantId, product, dto);
      return this.writePair(tx, tenantId, product.id, dto, delta);
    });

    this.eventEmitter.emit('stock.movement.created', {
      tenantId,
      productId: product.id,
      type: 'TRANSFER',
      quantity: Math.abs(movements[1].quantity),
    });
    return movements;
  }

  /** Mueve las unidades y devuelve cuántas quedaron en el depósito. */
  private async locateUnits(
    tx: Prisma.TransactionClient,
    tenantId: string,
    product: { id: string; name: string },
    dto: AssignUnlocatedStockDto,
  ): Promise<number> {
    const moved = await this.productUnitsRepository.locateUnassignedUnits(
      tenantId,
      product.id,
      dto.warehouseId,
      dto.serialNumbers,
      tx,
    );
    if (dto.serialNumbers && moved !== dto.serialNumbers.length) {
      throw new UnprocessableEntityException(
        'Una o más series no están en stock sin depósito asignado',
      );
    }
    if (moved === 0) {
      throw new UnprocessableEntityException(
        `${product.name} no tiene stock sin depósito asignado`,
      );
    }
    return moved;
  }

  /**
   * Cantidad con signo que recibe el depósito. Un saldo negativo son salidas
   * históricas sin ubicación: se le descuentan al depósito elegido, que tiene
   * que tener existencia para absorberlas.
   */
  private async resolveQuantity(
    tx: Prisma.TransactionClient,
    tenantId: string,
    product: { id: string; name: string },
    dto: AssignUnlocatedStockDto,
  ): Promise<number> {
    const balance = await this.stockMovementsRepository.sumUnlocated(
      tenantId,
      product.id,
      tx,
    );
    if (balance === 0) {
      throw new UnprocessableEntityException(
        `${product.name} no tiene stock sin depósito asignado`,
      );
    }
    const quantity = dto.quantity ?? Math.abs(balance);
    if (quantity > Math.abs(balance)) {
      throw new UnprocessableEntityException(
        `La cantidad supera el saldo sin depósito asignado (${balance})`,
      );
    }
    if (balance > 0) return quantity;

    const demand = {
      productId: product.id,
      warehouseId: dto.warehouseId,
      quantity,
      name: product.name,
    };
    const available =
      await this.stockMovementsRepository.sumByProductsAndWarehouse(
        tenantId,
        [demand],
        tx,
      );
    assertDemandsCovered(aggregateDemands([demand]), available);
    return -quantity;
  }

  private async writePair(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    dto: AssignUnlocatedStockDto,
    delta: number,
  ) {
    const referenceId = randomUUID();
    const base = {
      tenantId,
      productId,
      reason: MovementReason.TRANSFER,
      referenceId,
      notes: dto.notes?.trim() || DEFAULT_NOTES,
    };
    const legs = [
      { warehouseId: null, quantity: -delta },
      { warehouseId: dto.warehouseId, quantity: delta },
    ].sort((a, b) => a.quantity - b.quantity);

    const out = await this.stockMovementsRepository.create(
      { ...base, ...legs[0], type: StockMovementType.OUT },
      tx,
    );
    const incoming = await this.stockMovementsRepository.create(
      { ...base, ...legs[1], type: StockMovementType.IN },
      tx,
    );
    return [out, incoming];
  }
}
