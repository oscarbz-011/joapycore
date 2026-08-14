import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccountsReceivableRepository } from '../repositories/accounts-receivable.repository';

interface InstallmentPaidEvent {
  tenantId: string;
  loanId: string;
  saleOrderId: string;
  installmentId: string;
  amount: number;
}

@Injectable()
export class PaymentsOnInstallmentListener {
  private readonly logger = new Logger(PaymentsOnInstallmentListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly arRepository: AccountsReceivableRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('installment.paid')
  async handle(event: InstallmentPaidEvent) {
    try {
      // Find invoice for this sale order
      const invoice = await this.prisma.invoice.findFirst({
        where: { saleOrderId: event.saleOrderId, tenantId: event.tenantId },
        select: { id: true },
      });
      if (!invoice) return;

      // Find AR for this invoice
      const ar = await this.arRepository.findByInvoice(event.tenantId, invoice.id);
      if (!ar || ar.status === 'PAID' || ar.status === 'CANCELLED') return;

      // Atomic increment of paid amount
      await this.arRepository.incrementPaid(ar.id, event.amount);

      // Refresh to check new totals
      const updated = await this.prisma.accountsReceivable.findUnique({
        where: { id: ar.id },
        select: { id: true, amount: true, paidAmount: true },
      });
      if (!updated) return;

      const total =
        typeof updated.amount === 'object'
          ? (updated.amount as { toNumber(): number }).toNumber()
          : Number(updated.amount);
      const paid =
        typeof updated.paidAmount === 'object'
          ? (updated.paidAmount as { toNumber(): number }).toNumber()
          : Number(updated.paidAmount);

      if (paid >= total - 0.01) {
        await this.arRepository.updateStatus(ar.id, 'PAID');
        this.eventEmitter.emit('payment.ar.completed', {
          tenantId: event.tenantId,
          arId: ar.id,
          invoiceId: invoice.id,
        });
      } else {
        await this.arRepository.updateStatus(ar.id, 'PARTIAL');
      }
    } catch (err) {
      this.logger.error('Error processing installment.paid event', err);
    }
  }
}
