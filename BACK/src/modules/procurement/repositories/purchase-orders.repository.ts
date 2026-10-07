import { Injectable } from '@nestjs/common';
import { PurchaseOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

export function orderSequence(orderNumber: string | null): number {
  const match = orderNumber?.match(/^OC-\d{2}-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

@Injectable()
export class PurchaseOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, status?: PurchaseOrderStatus) {
    return this.prisma.purchaseOrder.findMany({
      where: { tenantId, ...(status && { status }) },
      include: { supplier: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.purchaseOrder.findFirst({
      where: { tenantId, id },
      include: {
        supplier: true,
        items: {
          include: {
            product: { include: { brand: true } },
            productUnits: true,
          },
        },
        statusChanges: {
          orderBy: { createdAt: 'asc' },
          include: {
            changedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
  }

  // Cambia el estado solo si la orden sigue en uno de los estados de partida:
  // dos usuarios que la mueven a la vez no se pisan (el segundo recibe 0).
  transition(
    tenantId: string,
    id: string,
    from: PurchaseOrderStatus[],
    to: PurchaseOrderStatus,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.purchaseOrder.updateMany({
      where: { tenantId, id, status: { in: from } },
      data: { status: to },
    });
  }

  recordStatusChange(
    data: Prisma.PurchaseOrderStatusChangeUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.purchaseOrderStatusChange.create({ data });
  }

  // Estado de las fichas que se van a comprar — se valida en el servicio
  // (ver PurchaseOrdersService.create) que estén ACTIVE antes de armar la
  // orden. Se consulta desde acá, y no inyectando el repositorio de
  // Inventario, para no acoplar el módulo de Compras al de Inventario.
  findProductStatuses(tenantId: string, ids: string[]) {
    return this.prisma.product.findMany({
      where: { tenantId, id: { in: ids }, deletedAt: null },
      select: { id: true, name: true, status: true, isPurchasable: true },
    });
  }

  // El correlativo es por empresa y no se reinicia con el año, así que el
  // número más alto es siempre el del año más reciente y alcanza con ordenar
  // el texto (mismo criterio que los presupuestos, PRES-AA-000001).
  findLastOrderNumber(
    tenantId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.purchaseOrder.findFirst({
      where: { tenantId, orderNumber: { startsWith: 'OC-' } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
  }

  // Filtra por empresa y proveedor: un ítem de otro proveedor no se devuelve
  // y el servicio lo rechaza.
  findCatalogItems(tenantId: string, supplierId: string, ids: string[]) {
    return this.prisma.supplierCatalogItem.findMany({
      where: { tenantId, supplierId, id: { in: ids } },
      select: {
        id: true,
        productId: true,
        supplierSku: true,
        description: true,
      },
    });
  }

  create(
    tenantId: string,
    data: Omit<Prisma.PurchaseOrderUncheckedCreateInput, 'tenantId'>,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.purchaseOrder.create({ data: { ...data, tenantId } });
  }

  updateStatus(
    tenantId: string,
    id: string,
    status: PurchaseOrderStatus,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.purchaseOrder.updateMany({
      where: { tenantId, id },
      data: { status },
    });
  }

  createItem(
    data: Prisma.PurchaseOrderItemUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.purchaseOrderItem.create({ data });
  }

  findItem(id: string) {
    return this.prisma.purchaseOrderItem.findUnique({
      where: { id },
      include: { product: true, purchaseOrder: true },
    });
  }

  findItems(purchaseOrderId: string, client: PrismaClientOrTx = this.prisma) {
    return client.purchaseOrderItem.findMany({ where: { purchaseOrderId } });
  }

  updateItemReceivedQty(
    id: string,
    receivedQty: number,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.purchaseOrderItem.update({
      where: { id },
      data: { receivedQty },
    });
  }
}
