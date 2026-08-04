import { Injectable } from '@nestjs/common';
import { InstallmentStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class InstallmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByLoan(tenantId: string, loanId: string) {
    return this.prisma.installment.findMany({
      where: { loanId, tenantId },
      orderBy: { number: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.installment.findFirst({
      where: { id, tenantId },
      include: { loan: { select: { id: true, saleOrderId: true } } },
    });
  }

  findOverdue(tenantId: string) {
    return this.prisma.installment.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { lt: new Date() },
      },
      include: { loan: { include: { customer: { select: { id: true, firstName: true, lastName: true } } } } },
      orderBy: { dueDate: 'asc' },
    });
  }

  markAllOverdue() {
    return this.prisma.installment.updateMany({
      where: {
        status: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { lt: new Date() },
      },
      data: { status: 'OVERDUE' },
    });
  }

  update(
    id: string,
    data: {
      paidAmount: number;
      paidAt?: Date;
      paymentMethod?: PaymentMethod;
      paymentReference?: string;
      paymentDate?: Date;
      status: InstallmentStatus;
      notes?: string;
    },
  ) {
    return this.prisma.installment.update({ where: { id }, data });
  }
}
