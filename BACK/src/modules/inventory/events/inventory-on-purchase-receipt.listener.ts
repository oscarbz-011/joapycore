import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MovementReason } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProductUnitsRepository } from '../repositories/product-units.repository';
import { StockMovementsRepository } from '../repositories/stock-movements.repository';
import { StockSourcesRepository } from '../repositories/stock-sources.repository';
import { StockEntryService } from '../services/stock-entry.service';

interface PurchaseReceiptCreatedEvent {
  tenantId: string;
  purchaseOrderId: string;
  purchaseReceiptId: string;
  warehouseId?: string;
}

// Único lugar donde una recepción de compra se convierte en stock real —
// procurement solo emite el evento, nunca toca StockMovement/ProductUnit/
// ProductBatch directamente (ver COMPRAS_INVENTARIO_LOGISTICA.md).
@Injectable()
export class InventoryOnPurchaseReceiptListener {
  private readonly logger = new Logger(InventoryOnPurchaseReceiptListener.name);

  constructor(
    // Solo para abrir la transacción; los accesos a datos van por repositorios.
    private readonly prisma: PrismaService,
    private readonly stockEntryService: StockEntryService,
    private readonly stockSources: StockSourcesRepository,
    private readonly stockMovements: StockMovementsRepository,
    private readonly productUnits: ProductUnitsRepository,
  ) {}

  @OnEvent('purchase.receipt.created')
  async handle(event: PurchaseReceiptCreatedEvent) {
    try {
      await this.process(event);
    } catch (error) {
      this.logger.error(
        `No se pudo procesar el ingreso de stock de la recepción ${event.purchaseReceiptId}: ${(error as Error).message}`,
      );
    }
  }

  private async process(event: PurchaseReceiptCreatedEvent) {
    const { tenantId, purchaseReceiptId } = event;

    const receipt = await this.stockSources.findPurchaseReceiptWithItems(
      tenantId,
      purchaseReceiptId,
    );
    if (!receipt) return;

    await this.prisma.$transaction(async (tx) => {
      // Idempotencia: si esta recepción ya generó movimientos, no repetir.
      const itemIds = receipt.items.map((i) => i.id);
      const alreadyProcessed = await this.stockMovements.exists(
        { tenantId, referenceId: { in: itemIds } },
        tx,
      );
      const alreadyProcessedUnits =
        await this.productUnits.existsForReceiptItems(tenantId, itemIds, tx);
      if (alreadyProcessed || alreadyProcessedUnits) return;

      for (const item of receipt.items) {
        await this.stockEntryService.registerEntry(
          tenantId,
          {
            productId: item.productId,
            quantity: item.quantity,
            reason: MovementReason.PURCHASE,
            warehouseId: receipt.warehouseId ?? undefined,
            referenceId: item.id,
            unitCost: Number(item.unitCost),
            batchNumber: item.batchNumber ?? undefined,
            expiresAt: item.expiresAt ?? undefined,
            serialNumbers: item.product.isSerialized
              ? item.serialNumbers
              : undefined,
            purchaseOrderItemId: item.purchaseOrderItemId,
            purchaseReceiptItemId: item.id,
          },
          tx,
        );
      }
    });
  }
}
