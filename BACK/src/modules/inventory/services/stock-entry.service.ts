import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MovementReason, StockInitialSourceType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';
import { ProductsRepository } from '../repositories/products.repository';
import { ProductUnitsRepository } from '../repositories/product-units.repository';
import { ProductBatchesRepository } from '../repositories/product-batches.repository';
import { StockMovementsRepository } from '../repositories/stock-movements.repository';

export interface RegisterStockEntryParams {
  productId: string;
  quantity: number;
  reason: MovementReason;
  warehouseId?: string;
  branchId?: string;
  referenceId?: string;
  unitCost?: number;
  batchNumber?: string;
  expiresAt?: Date;
  serialNumbers?: string[];
  purchaseOrderItemId?: string;
  purchaseReceiptItemId?: string;
  initialSourceType?: StockInitialSourceType;
  notes?: string;
}

// Pieza compartida de "crear movimiento IN (+ lote si aplica)" — la usan
// tanto el listener de recepción de compra (reason=PURCHASE) como el
// endpoint de carga inicial (reason=INITIAL). Ningún otro lugar del código
// debe crear un StockMovement de ingreso directamente.
@Injectable()
export class StockEntryService {
  private readonly logger = new Logger(StockEntryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productsRepository: ProductsRepository,
    private readonly productUnitsRepository: ProductUnitsRepository,
    private readonly productBatchesRepository: ProductBatchesRepository,
    private readonly stockMovements: StockMovementsRepository,
  ) {}

  async registerEntry(
    tenantId: string,
    params: RegisterStockEntryParams,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const product = await this.productsRepository.findById(
      tenantId,
      params.productId,
    );
    if (!product) throw new NotFoundException('Product not found');

    if (product.isSerialized) {
      const serials = params.serialNumbers ?? [];
      if (serials.length !== params.quantity) {
        throw new UnprocessableEntityException(
          `Se requieren ${params.quantity} números de serie para ${product.name}`,
        );
      }
      await this.productUnitsRepository.createMany(
        tenantId,
        params.productId,
        serials,
        {
          purchaseOrderItemId: params.purchaseOrderItemId,
          purchaseReceiptItemId: params.purchaseReceiptItemId,
        },
        client,
      );
      return;
    }

    let batchId: string | undefined;
    if (product.usesLots && params.batchNumber) {
      if (params.unitCost == null) {
        throw new BadRequestException(
          'Se requiere el costo unitario para crear un lote',
        );
      }
      const batch = await this.productBatchesRepository.upsertBatch(
        tenantId,
        params.productId,
        {
          batchNumber: params.batchNumber,
          unitCost: params.unitCost,
          quantity: params.quantity,
          expiresAt: params.expiresAt,
        },
        client,
      );
      batchId = batch.id;
    }

    await this.stockMovements.create(
      {
        tenantId,
        productId: params.productId,
        type: 'IN',
        reason: params.reason,
        quantity: params.quantity,
        warehouseId: params.warehouseId,
        branchId: params.branchId,
        referenceId: params.referenceId,
        batchId,
        initialSourceType:
          params.reason === MovementReason.INITIAL
            ? params.initialSourceType
            : undefined,
        notes: params.notes,
      },
      client,
    );
  }

  // Descuenta `quantity` de los lotes disponibles más antiguos (FIFO) para
  // `productId`. Devuelve el id del primer lote consumido (para
  // SaleOrderItem.batchId). Si el stock de lotes no alcanza para cubrir
  // `quantity` (drift entre el total y la suma de lotes), loguea y sigue —
  // no bloquea la entrega.
  //
  // IMPORTANTE: sales ya creó UN StockMovement OUT combinado para esta línea
  // antes de emitir el evento que dispara este método (sales no sabe nada de
  // lotes) — este método NO suma un OUT nuevo (eso descontaría el stock dos
  // veces), sino que reemplaza ese movimiento combinado por uno por lote
  // tocado, preservando la misma cantidad total.
  async consumeFifo(
    tenantId: string,
    productId: string,
    quantity: number,
    referenceId: string,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<string | undefined> {
    const batches = await this.productBatchesRepository.findAvailableFifo(
      tenantId,
      productId,
      client,
    );

    let remaining = quantity;
    const allocations: { batchId: string; take: number }[] = [];
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.remainingQty);
      if (take <= 0) continue;
      allocations.push({ batchId: batch.id, take });
      remaining -= take;
    }

    if (remaining > 0) {
      this.logger.warn(
        `FIFO: no quedó lote suficiente para el producto ${productId} (tenant ${tenantId}) — faltaron ${remaining} unidades de trazabilidad por lote`,
      );
    }

    for (const { batchId, take } of allocations) {
      await this.productBatchesRepository.decrementRemaining(
        batchId,
        take,
        client,
      );
    }

    const existing = await this.stockMovements.findUnbatchedOut(
      tenantId,
      productId,
      referenceId,
      client,
    );
    if (existing) {
      await this.stockMovements.delete(existing.id, client);
    }
    for (const { batchId, take } of allocations) {
      await this.stockMovements.create(
        {
          tenantId,
          productId,
          type: 'OUT',
          reason: MovementReason.SALE_OUT,
          quantity: -take,
          batchId,
          referenceId,
        },
        client,
      );
    }
    if (remaining > 0) {
      // Remanente sin trazabilidad por lote — se registra igual para que la
      // suma total de stock siga siendo exacta.
      await this.stockMovements.create(
        {
          tenantId,
          productId,
          type: 'OUT',
          reason: MovementReason.SALE_OUT,
          quantity: -remaining,
          referenceId,
        },
        client,
      );
    }

    return allocations[0]?.batchId;
  }
}
