import { Injectable } from '@nestjs/common';
import type { OrderChannel } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

/**
 * Lecturas de datos de otros módulos que Inventario necesita: los documentos
 * que originan movimientos de stock (facturas, pedidos, recepciones), los
 * depósitos y el rubro de la empresa.
 */
@Injectable()
export class StockSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findWarehouse(
    tenantId: string,
    warehouseId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
      select: { id: true, name: true, isActive: true },
    });
  }

  findWarehouses(tenantId: string) {
    return this.prisma.warehouse.findMany({
      where: { tenantId },
      select: { id: true, name: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  // El rubro define con qué tipo nace un producto si no se indica.
  async findTenantIndustry(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { industry: true },
    });
    return tenant?.industry ?? null;
  }

  findSaleItemsForReturn(
    tenantId: string,
    saleItemIds: string[],
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.saleOrderItem.findMany({
      where: { id: { in: saleItemIds }, saleOrder: { tenantId } },
      select: {
        id: true,
        productId: true,
        quantity: true,
        warehouseId: true,
        product: { select: { name: true, unitCode: true, isSerialized: true } },
      },
    });
  }

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
            product: {
              select: {
                isSerialized: true,
                usesLots: true,
                salesChannels: true,
                salesChannelsOnReceipt: true,
              },
            },
          },
        },
      },
    });
  }

  // El filtro por canales pendientes hace la operación idempotente: si otra
  // recepción ya los abrió, esta no cambia nada.
  openSalesChannels(
    tenantId: string,
    productId: string,
    salesChannels: OrderChannel[],
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.product.updateMany({
      where: {
        tenantId,
        id: productId,
        salesChannelsOnReceipt: { isEmpty: false },
      },
      data: { salesChannels, salesChannelsOnReceipt: [] },
    });
  }
}
