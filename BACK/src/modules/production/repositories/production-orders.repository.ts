import { Injectable } from '@nestjs/common';
import { Prisma, ProductionOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

const ORDER_INCLUDE = {
  product: { select: { id: true, name: true, unit: true } },
  warehouse: { select: { id: true, name: true } },
  items: {
    include: {
      component: {
        select: { id: true, name: true, unit: true, costPrice: true },
      },
    },
  },
} as const;

@Injectable()
export class ProductionOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, status?: ProductionOrderStatus) {
    return this.prisma.productionOrder.findMany({
      where: { tenantId, ...(status && { status }) },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(
    tenantId: string,
    id: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productionOrder.findFirst({
      where: { tenantId, id },
      include: ORDER_INCLUDE,
    });
  }

  // Correlativo por tenant — mismo criterio que PurchaseReceipt.receiptNumber.
  async nextOrderNumber(
    tenantId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const last = await client.productionOrder.findFirst({
      where: { tenantId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    return (last?.orderNumber ?? 0) + 1;
  }

  create(
    tenantId: string,
    data: Omit<Prisma.ProductionOrderUncheckedCreateInput, 'tenantId'>,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productionOrder.create({ data: { ...data, tenantId } });
  }

  createItems(
    data: Prisma.ProductionOrderItemUncheckedCreateInput[],
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productionOrderItem.createMany({ data });
  }

  updateStatus(
    tenantId: string,
    id: string,
    data: {
      status: ProductionOrderStatus;
      startedAt?: Date;
      completedAt?: Date;
    },
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productionOrder.updateMany({ where: { tenantId, id }, data });
  }

  updateItemUsedQuantity(
    id: string,
    usedQuantity: number,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productionOrderItem.update({
      where: { id },
      data: { usedQuantity },
    });
  }

  // Receta del producto a fabricar — se explota al crear la orden.
  findRecipe(tenantId: string, productId: string) {
    return this.prisma.productComponent.findMany({
      where: { tenantId, productId },
      include: { component: { select: { id: true, name: true, unit: true } } },
    });
  }
}
