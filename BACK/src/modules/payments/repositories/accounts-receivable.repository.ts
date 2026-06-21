import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AccountsReceivableRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.accountsReceivable.findMany({
      where: { tenantId },
      include: {
        invoice: {
          include: {
            saleOrder: {
              include: { customer: true },
            },
          },
        },
        paymentRecords: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.accountsReceivable.findFirst({
      where: { id, tenantId },
      include: {
        invoice: {
          include: {
            saleOrder: { include: { customer: true } },
          },
        },
        paymentRecords: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  create(data: Prisma.AccountsReceivableUncheckedCreateInput) {
    return this.prisma.accountsReceivable.create({ data });
  }

  updateAmounts(
    id: string,
    paidAmount: number,
    status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED',
  ) {
    return this.prisma.accountsReceivable.update({
      where: { id },
      data: { paidAmount, status },
    });
  }
}
