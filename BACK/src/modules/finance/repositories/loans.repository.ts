import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class LoansRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return {
      installments: {
        orderBy: { number: 'asc' as const },
        include: {
          // Solo cargos vigentes (todavía no cobrados) — el detalle de lo
          // ya cobrado vive en PaymentReceiptItem, no acá.
          interestCharges: {
            where: { amount: { gt: 0 } },
            include: { component: { select: { name: true } } },
          },
        },
      },
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

  // Alta sin relaciones: las cuotas se crean después en la misma transacción.
  createBare(
    data: Prisma.LoanUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.loan.create({ data });
  }

  findWithSchedule(id: string, client: PrismaClientOrTx = this.prisma) {
    return client.loan.findUniqueOrThrow({
      where: { id },
      include: {
        installments: { orderBy: { number: 'asc' } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        saleOrder: { select: { id: true, orderDate: true } },
      },
    });
  }

  findScheduleBySaleOrder(tenantId: string, saleOrderId: string) {
    return this.prisma.loan.findFirst({
      where: { tenantId, saleOrderId },
      include: { installments: { orderBy: { number: 'asc' } } },
    });
  }

  // Préstamos activos con su cuota impaga más antigua (detección de Morosos).
  findActiveWithOldestUnpaid(tenantId: string) {
    return this.prisma.loan.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: {
        id: true,
        customerId: true,
        installments: {
          where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
          orderBy: { dueDate: 'asc' },
          take: 1,
          select: { dueDate: true },
        },
      },
    });
  }

  updateStatus(
    id: string,
    status: 'ACTIVE' | 'PAID' | 'CANCELLED',
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.loan.update({ where: { id }, data: { status } });
  }
}
