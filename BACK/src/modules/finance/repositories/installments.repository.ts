import { Injectable } from '@nestjs/common';
import { InstallmentStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

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
      include: {
        loan: {
          select: {
            id: true,
            saleOrderId: true,
            customerId: true,
            saleOrder: { select: { branchId: true } },
          },
        },
      },
    });
  }

  findPendingByLoan(tenantId: string, loanId: string) {
    return this.prisma.installment.findMany({
      where: {
        tenantId,
        loanId,
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      },
      orderBy: { number: 'asc' },
    });
  }

  findOverdue(tenantId: string) {
    return this.prisma.installment.findMany({
      where: {
        tenantId,
        // PENDING/PARTIAL con dueDate pasada = todavía no la marcó OVERDUE
        // el cron nocturno (lag ya documentado en v0.25/v0.26); OVERDUE = ya
        // marcada. Sin este último, la cuota desaparece de este listado en
        // cuanto el cron corre — justo cuando recalculateInterestCharges()
        // empieza a generarle cargos de mora, dejándolos invisibles acá.
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        dueDate: { lt: new Date() },
      },
      include: {
        loan: {
          include: {
            customer: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        interestCharges: {
          where: { amount: { gt: 0 } },
          include: { component: { select: { name: true } } },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  findAllOverdueForMora() {
    return this.prisma.installment.findMany({
      where: { status: 'OVERDUE' },
      select: {
        id: true,
        tenantId: true,
        loanId: true,
        amount: true,
        dueDate: true,
      },
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

  // Recalculado desde cero cada noche por InstallmentsSchedulerService — ver
  // interest-calc.service.ts. `amount` es el cargo vigente completo, no un
  // delta a sumar.
  upsertInterestCharge(
    installmentId: string,
    componentId: string,
    amount: number,
    periodsElapsed: number,
  ) {
    return this.prisma.installmentInterestCharge.upsert({
      where: { installmentId_componentId: { installmentId, componentId } },
      create: { installmentId, componentId, amount, periodsElapsed },
      update: { amount, periodsElapsed },
    });
  }

  // Cargos vigentes (amount > 0) de una o más cuotas, con el nombre del
  // componente para itemizar el recibo — usado por LoansService al aplicar
  // un pago.
  findOpenChargesByInstallments(installmentIds: string[]) {
    return this.prisma.installmentInterestCharge.findMany({
      where: { installmentId: { in: installmentIds }, amount: { gt: 0 } },
      include: { component: { select: { name: true } } },
      orderBy: { component: { order: 'asc' } },
    });
  }

  updateChargeAmount(
    id: string,
    amount: number,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.installmentInterestCharge.update({
      where: { id },
      data: { amount },
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
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.installment.update({ where: { id }, data });
  }
}
