import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class SaleOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    const userSelect = {
      select: { id: true, firstName: true, lastName: true },
    };
    return {
      customer: true,
      items: { include: { product: true, productUnits: true, batch: true } },
      createdBy: userSelect,
      seller: userSelect,
      approvedBy: userSelect,
      rejectedBy: userSelect,
      invoice: { select: { id: true, status: true } },
      loan: { select: { totalAmount: true, interestRate: true } },
      salePayments: { orderBy: { paymentDate: 'asc' as const } },
      guarantors: { orderBy: { createdAt: 'asc' as const } },
    };
  }

  findPendingApprovals(tenantId: string) {
    return this.prisma.saleOrder.findMany({
      where: { tenantId, status: 'PENDING_CREDIT_APPROVAL' },
      include: this.include,
      orderBy: { createdAt: 'asc' },
    });
  }

  findAll(tenantId: string, sellerId?: string) {
    return this.prisma.saleOrder.findMany({
      where: {
        tenantId,
        ...(sellerId
          ? { OR: [{ sellerId }, { sellerId: null, createdById: sellerId }] }
          : {}),
      },
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

  findLastQuoteNumber(tenantId: string) {
    return this.prisma.saleOrder.findFirst({
      where: { tenantId, quoteNumber: { startsWith: 'PRES-' } },
      orderBy: { quoteNumber: 'desc' },
      select: { quoteNumber: true },
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
