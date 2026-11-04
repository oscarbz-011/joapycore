import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { LoanCredits } from '../../../common/contracts/loan-credits.contract';
import { InstallmentsRepository } from '../repositories/installments.repository';
import { LoansRepository } from '../repositories/loans.repository';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class LoanCreditsService implements LoanCredits {
  constructor(
    private readonly loansRepository: LoansRepository,
    private readonly installmentsRepository: InstallmentsRepository,
  ) {}

  async applyCredit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleOrderId: string,
    amount: number,
  ): Promise<number> {
    if (amount <= 0) return 0;
    const loan = await this.loansRepository.findBareBySaleOrder(
      tenantId,
      saleOrderId,
      tx,
    );
    if (!loan || loan.status !== 'ACTIVE') return 0;

    const open = await this.installmentsRepository.findOpenByLoanFromLast(
      tenantId,
      loan.id,
      tx,
    );
    const now = new Date();
    let remaining = round2(amount);
    let stillOpen = open.length;
    for (const inst of open) {
      if (remaining <= 0) break;
      const instAmount = Number(inst.amount);
      const paid = Number(inst.paidAmount);
      const cut = Math.min(remaining, round2(instAmount - paid));
      if (cut <= 0) continue;
      const newAmount = round2(instAmount - cut);
      const settled = newAmount <= paid + 0.01;
      if (settled) stillOpen -= 1;
      await this.installmentsRepository.update(
        inst.id,
        {
          amount: newAmount,
          ...(settled && { status: 'PAID', paidAt: inst.paidAt ?? now }),
        },
        tx,
      );
      remaining = round2(remaining - cut);
    }

    const applied = round2(amount - remaining);
    await this.loansRepository.update(
      loan.id,
      {
        totalAmount: round2(Number(loan.totalAmount) - applied),
        ...(stillOpen === 0 && { status: 'PAID' }),
      },
      tx,
    );
    return applied;
  }

  async cancel(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleOrderId: string,
  ): Promise<void> {
    const loan = await this.loansRepository.findBareBySaleOrder(
      tenantId,
      saleOrderId,
      tx,
    );
    if (!loan || loan.status === 'CANCELLED') return;
    await this.applyCredit(tx, tenantId, saleOrderId, Number(loan.totalAmount));
    await this.loansRepository.update(loan.id, { status: 'CANCELLED' }, tx);
  }

  async hasCollected(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleOrderId: string,
  ): Promise<boolean> {
    const loan = await this.loansRepository.findBareBySaleOrder(
      tenantId,
      saleOrderId,
      tx,
    );
    if (!loan) return false;
    return this.installmentsRepository.hasCollected(tenantId, loan.id, tx);
  }
}
