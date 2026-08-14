import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';

interface InvoiceCancelledEvent {
  tenantId: string;
  invoiceId: string;
}

@Injectable()
export class InventoryOnInvoiceListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('invoice.cancelled')
  async handle(event: InvoiceCancelledEvent) {
    const { tenantId, invoiceId } = event;

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        saleOrderId: true,
        saleOrder: {
          select: {
            items: {
              select: {
                id: true,
                productId: true,
                quantity: true,
                warehouseId: true,
                product: { select: { isSerialized: true } },
              },
            },
          },
        },
      },
    });

    if (!invoice?.saleOrder) return;

    await this.prisma.$transaction(async (tx) => {
      // Idempotency: skip if a reversal IN movement already exists for this invoice.
      const alreadyReversed = await tx.stockMovement.findFirst({
        where: { tenantId, referenceId: invoiceId, type: 'IN' },
      });
      if (alreadyReversed) return;

      for (const item of invoice.saleOrder!.items) {
        if (!item.productId) continue; // free-text / service lines have no stock
        if (item.product?.isSerialized) {
          // Reset units to available and unlink them from the cancelled sale order item.
          await tx.productUnit.updateMany({
            where: { tenantId, saleOrderItemId: item.id },
            data: { status: 'IN_STOCK', saleOrderItemId: null },
          });
        } else {
          // Create a reversal IN movement that offsets the OUT created during confirmation.
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              warehouseId: item.warehouseId ?? undefined,
              type: 'IN',
              quantity: item.quantity,
              referenceId: invoiceId,
            },
          });
        }
      }
    });
  }
}
