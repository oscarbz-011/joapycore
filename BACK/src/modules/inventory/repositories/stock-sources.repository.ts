import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

/**
 * Lecturas de los documentos que originan movimientos de stock (facturas,
 * pedidos, recepciones), acotadas a lo que Inventario necesita en sus
 * listeners.
 */
@Injectable()
export class StockSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findInvoiceItemsForReversal(tenantId: string, invoiceId: string) {
    return this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
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
  }

  findSaleOrderItemsForFifo(tenantId: string, saleOrderId: string) {
    return this.prisma.saleOrder.findFirst({
      where: { id: saleOrderId, tenantId },
      include: {
        items: {
          include: {
            product: { select: { isSerialized: true, usesLots: true } },
          },
        },
      },
    });
  }

  findPurchaseReceiptWithItems(tenantId: string, purchaseReceiptId: string) {
    return this.prisma.purchaseReceipt.findFirst({
      where: { id: purchaseReceiptId, tenantId },
      include: {
        items: {
          include: {
            product: { select: { isSerialized: true, usesLots: true } },
          },
        },
      },
    });
  }

  setSaleOrderItemBatch(
    saleOrderItemId: string,
    batchId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.saleOrderItem.update({
      where: { id: saleOrderItemId },
      data: { batchId },
    });
  }
}
