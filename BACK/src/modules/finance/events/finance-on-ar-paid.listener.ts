import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { FinanceSourcesRepository } from '../repositories/finance-sources.repository';
import { InstallmentsRepository } from '../repositories/installments.repository';
import { LoansRepository } from '../repositories/loans.repository';

interface ArPaidEvent {
  tenantId: string;
  arId: string;
  invoiceId: string;
}

@Injectable()
export class FinanceOnArPaidListener {
  private readonly logger = new Logger(FinanceOnArPaidListener.name);

  constructor(
    // Solo para abrir la transacción; los accesos a datos van por repositorios.
    private readonly prisma: PrismaService,
    private readonly sources: FinanceSourcesRepository,
    private readonly loansRepository: LoansRepository,
    private readonly installmentsRepository: InstallmentsRepository,
  ) {}

  // When an AR is paid in full via direct payment (not via individual installments),
  // close all remaining installments on the associated loan.
  @OnEvent('payment.ar.completed')
  async handle(event: ArPaidEvent) {
    try {
      const loanId = await this.sources.findLoanIdByInvoice(
        event.tenantId,
        event.invoiceId,
      );
      if (!loanId) return;

      const now = new Date();

      await this.prisma.$transaction(async (tx) => {
        const pending = await this.installmentsRepository.findUnpaidByLoan(
          event.tenantId,
          loanId,
          tx,
        );
        if (!pending.length) return;

        for (const inst of pending) {
          const amount =
            typeof inst.amount === 'object'
              ? (inst.amount as { toNumber(): number }).toNumber()
              : Number(inst.amount);
          await this.installmentsRepository.update(
            inst.id,
            { paidAmount: amount, status: 'PAID', paidAt: now },
            tx,
          );
        }

        await this.loansRepository.updateStatus(loanId, 'PAID', tx);
      });
    } catch (err) {
      this.logger.error('Error closing installments on AR paid event', err);
    }
  }
}
