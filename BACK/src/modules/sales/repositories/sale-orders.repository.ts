import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class SaleOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return {
      customer: true,
      items: { include: { product: true, productUnits: true } },
    };
  }

  findAll(tenantId: string) {
    return this.prisma.saleOrder.findMany({
      where: { tenantId },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.saleOrder.findFirst({
      where: { id, tenantId },
      include: this.include,
    });
  }

  create(
    data: Prisma.SaleOrderUncheckedCreateInput,
    client?: PrismaClientOrTx,
  ) {
    const db = client ?? this.prisma;
    return db.saleOrder.create({ data, include: this.include });
  }

  createItem(
    data: Prisma.SaleOrderItemUncheckedCreateInput,
    client?: PrismaClientOrTx,
  ) {
    const db = client ?? this.prisma;
    return db.saleOrderItem.create({ data });
  }

  updateStatus(id: string, status: string, client?: PrismaClientOrTx) {
    const db = client ?? this.prisma;
    return db.saleOrder.update({
      where: { id },
      data: { status: status as never },
    });
  }
}
