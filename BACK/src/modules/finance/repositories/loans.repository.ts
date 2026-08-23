import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class LoansRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return {
      installments: { orderBy: { number: 'asc' as const } },
      customer: { select: { id: true, firstName: true, lastName: true } },
      saleOrder: {
        select: {
          id: true,
          orderDate: true,
          branchId: true,
          items: {
            select: {
              id: true,
              quantity: true,
              product: { select: { id: true, name: true, model: true } },
              description: true,
            },
          },
        },
      },
    };
  }

  findAll(tenantId: string) {
    return this.prisma.loan.findMany({
      where: { tenantId },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.loan.findFirst({
      where: { id, tenantId },
      include: this.include,
    });
  }

  findBySaleOrder(tenantId: string, saleOrderId: string) {
    return this.prisma.loan.findFirst({
      where: { saleOrderId, tenantId },
      include: this.include,
    });
  }

  create(data: Prisma.LoanUncheckedCreateInput) {
    return this.prisma.loan.create({ data, include: this.include });
  }

  updateStatus(id: string, status: 'ACTIVE' | 'PAID' | 'CANCELLED') {
    return this.prisma.loan.update({ where: { id }, data: { status } });
  }
}
