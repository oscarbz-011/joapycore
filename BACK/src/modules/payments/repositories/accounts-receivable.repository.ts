import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class AccountsReceivableRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.accountsReceivable.findMany({
      where: { tenantId },
      include: {
        invoice: {
          include: {
            items: { select: { description: true, quantity: true } },
            saleOrder: {
              include: {
                customer: true,
                loan: {
                  select: {
                    totalAmount: true,
                    // number/dueDate/status habilitan calcular la mora en el
                    // frontend sobre la cuota real más próxima sin pagar, no
                    // sobre el AR.dueDate — ese campo queda fijo en la fecha
                    // de la primera cuota desde que se crea el préstamo y
                    // nunca se actualiza a medida que se van pagando cuotas.
                    installments: {
                      select: {
                        number: true,
                        dueDate: true,
                        status: true,
                        amount: true,
                        paidAmount: true,
                      },
                      orderBy: { number: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        paymentRecords: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(
    tenantId: string,
    id: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.accountsReceivable.findFirst({
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

  findAmounts(tenantId: string, id: string) {
    return this.prisma.accountsReceivable.findFirst({
      where: { id, tenantId },
      select: { id: true, amount: true, paidAmount: true },
    });
  }

  findByInvoice(tenantId: string, invoiceId: string) {
    return this.prisma.accountsReceivable.findFirst({
      where: { tenantId, invoiceId },
    });
  }

  create(
    data: Prisma.AccountsReceivableUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.accountsReceivable.create({ data });
  }

  // Atomic increment — eliminates read-modify-write race condition
  incrementPaid(
    id: string,
    amount: number,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.accountsReceivable.update({
      where: { id },
      data: { paidAmount: { increment: amount } },
      select: { paidAmount: true, amount: true, invoiceId: true },
    });
  }

  updateStatus(
    id: string,
    status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED',
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.accountsReceivable.update({
      where: { id },
      data: { status },
    });
  }

  // Kept for backwards compat with existing tests
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
