import { Injectable } from '@nestjs/common';
import { PurchaseOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

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
      },
    });
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
