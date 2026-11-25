import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LoanCredits } from '../../../common/contracts/loan-credits.contract';
import { InstallmentsRepository } from '../repositories/installments.repository';
import { LoansRepository } from '../repositories/loans.repository';
import { money } from '../../../common/money/money';

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
    if (money(amount).lte(0)) return 0;
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
    let remaining = money(amount);
    let stillOpen = open.length;
    for (const inst of open) {
      if (remaining.lte(0)) break;
      const instAmount = money(inst.amount);
      const paid = money(inst.paidAmount);
      const cut = Prisma.Decimal.min(remaining, instAmount.minus(paid));
      if (cut.lte(0)) continue;
      const newAmount = instAmount.minus(cut);
      const settled = newAmount.lte(paid);
      if (settled) stillOpen -= 1;
      await this.installmentsRepository.update(
        inst.id,
        {
          amount: newAmount,
          ...(settled && { status: 'PAID', paidAt: inst.paidAt ?? now }),
        },
        tx,
      );
      remaining = remaining.minus(cut);
    }

    const applied = money(amount).minus(remaining);
    await this.loansRepository.update(
      loan.id,
      {
        totalAmount: money(loan.totalAmount).minus(applied),
        ...(stillOpen === 0 && { status: 'PAID' }),
      },
      tx,
    );
    return applied.toNumber();
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
    await this.applyCredit(
      tx,
      tenantId,
      saleOrderId,
      money(loan.totalAmount).toNumber(),
    );
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
