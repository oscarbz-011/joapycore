import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class SaleTargetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findForPeriod(tenantId: string, period: string) {
    return this.prisma.saleTarget.findMany({
      where: { tenantId, period },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async upsertTarget(
    tenantId: string,
    period: string,
    userId: string | null,
    targetAmount: number,
  ) {
    const existing = await this.prisma.saleTarget.findFirst({
      where: { tenantId, period, userId },
    });
    if (existing) {
      return this.prisma.saleTarget.update({
        where: { id: existing.id },
        data: { targetAmount },
      });
    }
    return this.prisma.saleTarget.create({
      data: { tenantId, period, userId, targetAmount },
    });
  }

  deleteTarget(tenantId: string, period: string, userId: string | null) {
    return this.prisma.saleTarget.deleteMany({
      where: { tenantId, period, userId },
    });
  }

  getOrdersForPeriod(tenantId: string, from: Date, to: Date) {
    return this.prisma.saleOrder.findMany({
      where: {
        tenantId,
        status: { in: ['CONFIRMED', 'INVOICED'] },
        orderDate: { gte: from, lte: to },
      },
      select: {
        saleType: true,
        sellerId: true,
        createdById: true,
        seller:    { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        items: { select: { quantity: true, unitPrice: true } },
      },
    });
  }
}
