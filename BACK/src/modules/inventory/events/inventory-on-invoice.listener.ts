import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProductUnitsRepository } from '../repositories/product-units.repository';
import { StockMovementsRepository } from '../repositories/stock-movements.repository';
import { StockSourcesRepository } from '../repositories/stock-sources.repository';

interface InvoiceCancelledEvent {
  tenantId: string;
  invoiceId: string;
}

@Injectable()
export class InventoryOnInvoiceListener {
  constructor(
    // Solo para abrir la transacción; los accesos a datos van por repositorios.
    private readonly prisma: PrismaService,
    private readonly stockSources: StockSourcesRepository,
    private readonly stockMovements: StockMovementsRepository,
    private readonly productUnits: ProductUnitsRepository,
  ) {}

  @OnEvent('invoice.cancelled')
  async handle(event: InvoiceCancelledEvent) {
    const { tenantId, invoiceId } = event;

    const invoice = await this.stockSources.findInvoiceItemsForReversal(
      tenantId,
      invoiceId,
    );
    if (!invoice?.saleOrder) return;
    const items = invoice.saleOrder.items;

    await this.prisma.$transaction(async (tx) => {
      // Idempotency: skip if a reversal IN movement already exists for this invoice.
      const alreadyReversed = await this.stockMovements.exists(
        { tenantId, referenceId: invoiceId, type: 'IN' },
        tx,
      );
      if (alreadyReversed) return;

      for (const item of items) {
        if (!item.productId) continue; // free-text / service lines have no stock
        if (item.product?.isSerialized) {
          // Reset units to available and unlink them from the cancelled sale order item.
          await this.productUnits.restoreBySaleItem(tenantId, item.id, tx);
        } else {
          // Create a reversal IN movement that offsets the OUT created during confirmation.
          await this.stockMovements.create(
            {
              tenantId,
              productId: item.productId,
              warehouseId: item.warehouseId ?? undefined,
              type: 'IN',
              quantity: item.quantity,
              referenceId: invoiceId,
            },
            tx,
          );
        }
      }
    });
  }
}
