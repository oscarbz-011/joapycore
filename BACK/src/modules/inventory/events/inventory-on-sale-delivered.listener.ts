import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { StockEntryService } from '../services/stock-entry.service';

interface SaleOrderStockOutEvent {
  tenantId: string;
  saleOrderId: string;
}

// Consumo FIFO de lotes al entregarse una venta — sales no sabe nada de
// ProductBatch/usesLots, solo emite `sale.order.stock_out` después de crear
// sus propios StockMovement OUT (ver COMPRAS_INVENTARIO_LOGISTICA.md). Es
// consistencia eventual, no atómica con el OUT — mismo criterio que el resto
// del proyecto usa para efectos secundarios entre módulos.
@Injectable()
export class InventoryOnSaleDeliveredListener {
  private readonly logger = new Logger(InventoryOnSaleDeliveredListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockEntryService: StockEntryService,
  ) {}

  @OnEvent('sale.order.stock_out')
  async handle(event: SaleOrderStockOutEvent) {
    try {
      await this.process(event);
    } catch (error) {
      this.logger.error(
        `No se pudo procesar el consumo FIFO de lotes para la venta ${event.saleOrderId}: ${(error as Error).message}`,
      );
    }
  }

  private async process(event: SaleOrderStockOutEvent) {
    const { tenantId, saleOrderId } = event;

    const order = await this.prisma.saleOrder.findFirst({
      where: { id: saleOrderId, tenantId },
      include: {
        items: {
          include: {
            product: { select: { isSerialized: true, usesLots: true } },
          },
        },
      },
    });
    if (!order) return;

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (!item.productId) continue; // línea libre / servicio
        if (item.product?.isSerialized || !item.product?.usesLots) continue;

        // Idempotencia: si ya se consumió lote para esta línea, no repetir.
        const alreadyConsumed = await tx.stockMovement.findFirst({
          where: { tenantId, referenceId: item.id, batchId: { not: null } },
        });
        if (alreadyConsumed) continue;

        const firstBatchId = await this.stockEntryService.consumeFifo(
          tenantId,
          item.productId,
          item.quantity,
          item.id,
          tx,
        );
        if (firstBatchId) {
          await tx.saleOrderItem.update({
            where: { id: item.id },
            data: { batchId: firstBatchId },
          });
        }
      }
    });
  }
}
