import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MovementReason, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { StockEntryService } from '../services/stock-entry.service';

interface ProductionOrderCompletedEvent {
  tenantId: string;
  productionOrderId: string;
  productId: string;
  quantity: number;
  warehouseId: string | null;
  consumed: { productId: string; quantity: number }[];
}

// Único lugar donde una orden de producción se convierte en stock real: sale
// la materia prima consumida y entra el producto fabricado. Producción solo
// emite el evento — no toca StockMovement (mismo criterio que el listener de
// recepción de compra).
@Injectable()
export class InventoryOnProductionListener {
  private readonly logger = new Logger(InventoryOnProductionListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockEntryService: StockEntryService,
  ) {}

  @OnEvent('production.order.completed')
  async handle(event: ProductionOrderCompletedEvent) {
    try {
      await this.process(event);
    } catch (error) {
      this.logger.error(
        `No se pudo mover el stock de la orden de producción ${event.productionOrderId}: ${(error as Error).message}`,
      );
      // Se re-lanza: el servicio usa emitAsync y necesita enterarse, si no la
      // orden quedaría COMPLETED sin haber movido stock y nadie lo sabría.
      throw error;
    }
  }

  private async process(event: ProductionOrderCompletedEvent) {
    const { tenantId, productionOrderId } = event;

    await this.prisma.$transaction(async (tx) => {
      // Idempotencia: si esta orden ya generó movimientos, no repetir (mismo
      // criterio que el listener de recepción).
      const already = await tx.stockMovement.findFirst({
        where: { tenantId, referenceId: productionOrderId },
      });
      if (already) return;

      // 1) Salida de cada componente consumido.
      for (const line of event.consumed) {
        if (line.quantity <= 0) continue;
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: line.productId,
            type: StockMovementType.OUT,
            reason: MovementReason.PRODUCTION_OUT,
            // Negativo: el stock se calcula sumando movimientos.
            quantity: -Math.abs(line.quantity),
            warehouseId: event.warehouseId ?? undefined,
            referenceId: productionOrderId,
          },
        });
      }

      // 2) Ingreso del producto fabricado — vía StockEntryService para que
      // respete lotes/series igual que cualquier otro ingreso.
      await this.stockEntryService.registerEntry(
        tenantId,
        {
          productId: event.productId,
          quantity: event.quantity,
          reason: MovementReason.PRODUCTION_IN,
          warehouseId: event.warehouseId ?? undefined,
          referenceId: productionOrderId,
        },
        tx,
      );
    });
  }
}
