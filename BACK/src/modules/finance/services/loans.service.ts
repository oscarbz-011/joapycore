import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { InstallmentsRepository } from '../repositories/installments.repository';
import { LoansRepository } from '../repositories/loans.repository';
import type { PayInstallmentDto } from '../dto/pay-installment.dto';
import type { AdvancePaymentDto } from '../dto/advance-payment.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function toNum(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loansRepository: LoansRepository,
    private readonly installmentsRepository: InstallmentsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string) {
    return this.loansRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const loan = await this.loansRepository.findById(tenantId, id);
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    return loan;
  }

  async findByOrder(tenantId: string, saleOrderId: string) {
    const loan = await this.loansRepository.findBySaleOrder(tenantId, saleOrderId);
    if (!loan) throw new NotFoundException('No existe un préstamo para este pedido');
    return loan;
  }

  findOverdueInstallments(tenantId: string) {
    return this.installmentsRepository.findOverdue(tenantId);
  }

  async createFromOrder(tenantId: string, saleOrderId: string) {
    // Idempotent: skip if loan already exists for this order
    const existing = await this.loansRepository.findBySaleOrder(tenantId, saleOrderId);
    if (existing) return existing;

    const order = await this.prisma.saleOrder.findFirst({
      where: { id: saleOrderId, tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException(`Sale order ${saleOrderId} not found`);
    if (!order.installments || order.installments < 1) {
      throw new UnprocessableEntityException(
        'El pedido no tiene cuotas configuradas para generar un préstamo',
      );
    }

    const principal = order.items.reduce((sum, item) => {
      return sum + toNum(item.unitPrice) * item.quantity;
    }, 0);

    const interestRate = order.interestRate ? toNum(order.interestRate) : 0;
    const totalAmount = principal * (1 + interestRate / 100);
    const amountPerInstallment = Math.round(totalAmount / order.installments);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.create({
        data: {
          tenantId,
          saleOrderId,
          customerId: order.customerId,
          principal,
          interestRate,
          totalAmount,
          totalInstallments: order.installments!,
        },
      });

      for (let i = 1; i <= order.installments!; i++) {
        await tx.installment.create({
          data: {
            tenantId,
            loanId: loan.id,
            number: i,
            dueDate: addMonths(now, i),
            amount: amountPerInstallment,
          },
        });
      }

      return tx.loan.findUniqueOrThrow({
        where: { id: loan.id },
        include: {
          installments: { orderBy: { number: 'asc' } },
          customer: { select: { id: true, firstName: true, lastName: true } },
          saleOrder: { select: { id: true, orderDate: true } },
        },
      });
    });
  }

  async payInstallment(
    tenantId: string,
    installmentId: string,
    dto: PayInstallmentDto,
  ) {
    const installment = await this.installmentsRepository.findById(tenantId, installmentId);
    if (!installment) throw new NotFoundException('Cuota no encontrada');
    if (installment.status === 'PAID') {
      throw new UnprocessableEntityException('Esta cuota ya fue pagada');
    }

    const currentPaid = toNum(installment.paidAmount);
    const installmentAmount = toNum(installment.amount);
    const newPaid = currentPaid + dto.amount;
    // ceiling caps overpayment; isPaid compares against raw amount so fractional
    // Decimal values (e.g. 1221875/6 = 203645.83) are handled correctly
    const ceiling = Math.ceil(installmentAmount);

    if (newPaid > ceiling) {
      throw new UnprocessableEntityException(
        `El monto abonado (${newPaid}) supera el saldo de la cuota (${ceiling - currentPaid})`,
      );
    }

    const isPaid = newPaid >= installmentAmount;

    const updated = await this.installmentsRepository.update(installmentId, {
      paidAmount: newPaid,
      paidAt: isPaid ? new Date() : undefined,
      paymentMethod: dto.paymentMethod,
      paymentReference: dto.paymentReference,
      paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
      status: isPaid ? 'PAID' : 'PARTIAL',
      notes: dto.notes,
    });

    this.eventEmitter.emit('installment.paid', {
      tenantId,
      loanId: installment.loanId,
      saleOrderId: installment.loan.saleOrderId,
      installmentId,
      amount: dto.amount,
    });

    if (isPaid) {
      await this.checkAndCloseLoan(tenantId, installment.loanId);
    }

    return updated;
  }

  // Distributes amount across oldest-first pending installments (regular payment)
  async payByAmount(
    tenantId: string,
    loanId: string,
    dto: {
      amount: number;
      paymentMethod: string;
      paymentDate?: string;
      notes?: string;
    },
  ) {
    const loan = await this.findOne(tenantId, loanId);
    if (loan.status === 'PAID') {
      throw new UnprocessableEntityException('El préstamo ya está completamente pagado');
    }

    const pending = await this.installmentsRepository.findPendingByLoan(tenantId, loanId);
    if (!pending.length) {
      throw new UnprocessableEntityException('No hay cuotas pendientes para imputar');
    }

    const totalOutstanding = pending.reduce(
      (s, i) => s + toNum(i.amount) - toNum(i.paidAmount),
      0,
    );
    if (dto.amount > totalOutstanding) {
      throw new UnprocessableEntityException(
        `El monto (${dto.amount}) supera el saldo pendiente total (${totalOutstanding})`,
      );
    }

    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();

    await this.prisma.$transaction(async (tx) => {
      let remaining = dto.amount;
      for (const inst of pending) {
        if (remaining <= 0) break;
        const currentPaid = toNum(inst.paidAmount);
        const amount = toNum(inst.amount);
        const outstanding = amount - currentPaid;
        const payment = Math.min(remaining, outstanding);
        const newPaid = currentPaid + payment;
        const isPaid = newPaid >= amount;

        await tx.installment.update({
          where: { id: inst.id },
          data: {
            paidAmount: newPaid,
            paidAt: isPaid ? paymentDate : undefined,
            paymentMethod: dto.paymentMethod as never,
            paymentDate,
            status: isPaid ? 'PAID' : 'PARTIAL',
            notes: dto.notes,
          },
        });
        remaining -= payment;
      }
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      module: 'finance',
      action: 'loan.payment.registered',
      resourceId: loanId,
    } satisfies AuditLogEvent);

    await this.checkAndCloseLoan(tenantId, loanId);
    return this.loansRepository.findById(tenantId, loanId);
  }

  // Advance payment: REDUCE_INSTALLMENTS cancels from end; REDUCE_AMOUNT redistributes balance
  async advancePayment(tenantId: string, loanId: string, dto: AdvancePaymentDto) {
    const loan = await this.findOne(tenantId, loanId);
    if (loan.status === 'PAID') {
      throw new UnprocessableEntityException('El préstamo ya está completamente pagado');
    }

    const pending = await this.installmentsRepository.findPendingByLoan(tenantId, loanId);
    if (!pending.length) {
      throw new UnprocessableEntityException('No hay cuotas pendientes');
    }

    const totalOutstanding = pending.reduce(
      (s, i) => s + toNum(i.amount) - toNum(i.paidAmount),
      0,
    );
    if (dto.amount > totalOutstanding) {
      throw new UnprocessableEntityException(
        `El adelanto (${dto.amount}) supera el saldo pendiente total (${totalOutstanding})`,
      );
    }

    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();

    if (dto.mode === 'REDUCE_INSTALLMENTS') {
      // Apply from last installment backwards — cancels end cuotas first
      const reversed = [...pending].reverse();
      await this.prisma.$transaction(async (tx) => {
        let remaining = dto.amount;
        for (const inst of reversed) {
          if (remaining <= 0) break;
          const currentPaid = toNum(inst.paidAmount);
          const amount = toNum(inst.amount);
          const outstanding = amount - currentPaid;
          const payment = Math.min(remaining, outstanding);
          const newPaid = currentPaid + payment;
          const isPaid = newPaid >= amount;

          await tx.installment.update({
            where: { id: inst.id },
            data: {
              paidAmount: newPaid,
              paidAt: isPaid ? paymentDate : undefined,
              paymentMethod: dto.paymentMethod as never,
              paymentDate,
              status: isPaid ? 'PAID' : 'PARTIAL',
              notes: dto.notes,
            },
          });
          remaining -= payment;
        }
      });
    } else {
      // REDUCE_AMOUNT: for REDUCE_AMOUNT mode, no PARTIAL installments are allowed beforehand
      // to keep redistribution clean
      const hasPartial = pending.some((i) => i.status === 'PARTIAL');
      if (hasPartial) {
        throw new UnprocessableEntityException(
          'Existe una cuota parcialmente pagada. Finalice su pago antes de realizar un adelanto con reducción de monto.',
        );
      }

      const newOutstanding = totalOutstanding - dto.amount;
      const count = pending.length;
      const baseAmount = Math.floor(newOutstanding / count);
      const remainder = newOutstanding - baseAmount * count;

      await this.prisma.$transaction(async (tx) => {
        for (let i = 0; i < count; i++) {
          const inst = pending[i];
          const isLast = i === count - 1;
          const newAmount = baseAmount + (isLast ? remainder : 0);
          await tx.installment.update({
            where: { id: inst.id },
            data: { amount: newAmount, paidAmount: 0, status: 'PENDING' },
          });
        }
      });
    }

    this.eventEmitter.emit('audit.log', {
      tenantId,
      module: 'finance',
      action: 'loan.advance.paid',
      resourceId: loanId,
    } satisfies AuditLogEvent);

    await this.checkAndCloseLoan(tenantId, loanId);
    return this.loansRepository.findById(tenantId, loanId);
  }

  private async checkAndCloseLoan(tenantId: string, loanId: string) {
    const all = await this.installmentsRepository.findByLoan(tenantId, loanId);
    if (all.every((i) => i.status === 'PAID')) {
      await this.loansRepository.updateStatus(loanId, 'PAID');
      this.eventEmitter.emit('loan.paid', { tenantId, loanId });
    }
  }
}
