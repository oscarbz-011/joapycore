import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MovementReason } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
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
    private readonly prisma: PrismaService,
    private readonly stockEntryService: StockEntryService,
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

    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id: purchaseReceiptId, tenantId },
      include: {
        items: {
          include: {
            product: { select: { isSerialized: true, usesLots: true } },
          },
        },
      },
    });
    if (!receipt) return;

    await this.prisma.$transaction(async (tx) => {
      // Idempotencia: si esta recepción ya generó movimientos, no repetir.
      const alreadyProcessed = await tx.stockMovement.findFirst({
        where: {
          tenantId,
          referenceId: { in: receipt.items.map((i) => i.id) },
        },
      });
      const alreadyProcessedUnits = await tx.productUnit.findFirst({
        where: {
          tenantId,
          purchaseReceiptItemId: { in: receipt.items.map((i) => i.id) },
        },
      });
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
