import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';

interface ArPaidEvent {
  tenantId: string;
  arId: string;
  invoiceId: string;
}

@Injectable()
export class FinanceOnArPaidListener {
  private readonly logger = new Logger(FinanceOnArPaidListener.name);

  constructor(private readonly prisma: PrismaService) {}

  // When an AR is paid in full via direct payment (not via individual installments),
  // close all remaining installments on the associated loan.
  @OnEvent('payment.ar.completed')
  async handle(event: ArPaidEvent) {
    try {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: event.invoiceId },
        select: { saleOrder: { select: { loan: { select: { id: true } } } } },
      });
      const loanId = invoice?.saleOrder?.loan?.id;
      if (!loanId) return;

      const now = new Date();

      await this.prisma.$transaction(async (tx) => {
        const pending = await tx.installment.findMany({
          where: { loanId, tenantId: event.tenantId, status: { not: 'PAID' } },
        });
        if (!pending.length) return;

        for (const inst of pending) {
          const amount =
            typeof inst.amount === 'object'
              ? (inst.amount as { toNumber(): number }).toNumber()
              : Number(inst.amount);
          await tx.installment.update({
            where: { id: inst.id },
            data: { paidAmount: amount, status: 'PAID', paidAt: now },
          });
        }

        await tx.loan.update({
          where: { id: loanId },
          data: { status: 'PAID' },
        });
      });
    } catch (err) {
      this.logger.error('Error closing installments on AR paid event', err);
    }
  }
}
