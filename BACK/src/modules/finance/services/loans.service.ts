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

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
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
      const price =
        typeof item.unitPrice === 'object'
          ? (item.unitPrice as { toNumber(): number }).toNumber()
          : Number(item.unitPrice);
      return sum + price * item.quantity;
    }, 0);

    const interestRate = order.interestRate
      ? (typeof order.interestRate === 'object'
          ? (order.interestRate as { toNumber(): number }).toNumber()
          : Number(order.interestRate))
      : 0;

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

    const currentPaid =
      typeof installment.paidAmount === 'object'
        ? (installment.paidAmount as { toNumber(): number }).toNumber()
        : Number(installment.paidAmount);
    const installmentAmount =
      typeof installment.amount === 'object'
        ? (installment.amount as { toNumber(): number }).toNumber()
        : Number(installment.amount);

    const newPaid = currentPaid + dto.amount;
    const ceiling = Math.ceil(installmentAmount);

    if (newPaid > ceiling) {
      throw new UnprocessableEntityException(
        `El monto abonado (${newPaid}) supera el saldo de la cuota (${ceiling - currentPaid})`,
      );
    }

    const isPaid = newPaid >= ceiling;

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

    return updated;
  }
}
