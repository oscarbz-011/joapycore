import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ReceivableBalance,
  Receivables,
} from '../../../common/contracts/receivables.contract';
import { AccountsReceivableRepository } from '../repositories/accounts-receivable.repository';
import { isSettledInGuaranies, money } from '../../../common/money/money';

@Injectable()
export class ReceivablesService implements Receivables {
  constructor(private readonly arRepository: AccountsReceivableRepository) {}

  async balance(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
  ): Promise<ReceivableBalance | null> {
    const ar = await this.arRepository.findOpenByInvoice(
      tenantId,
      invoiceId,
      tx,
    );
    if (!ar) return null;
    const amount = money(ar.amount);
    const paid = money(ar.paidAmount);
    const outstanding = amount.minus(paid);
    return {
      amount: amount.toNumber(),
      paid: paid.toNumber(),
      outstanding: outstanding.isNegative() ? 0 : outstanding.toNumber(),
    };
  }

  async applyCredit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
    amount: number,
  ): Promise<void> {
    if (money(amount).lte(0)) return;
    const ar = await this.arRepository.findOpenByInvoice(
      tenantId,
      invoiceId,
      tx,
    );
    if (!ar) return;
    const paid = money(ar.paidAmount);
    const newAmount = money(ar.amount).minus(money(amount));
    if (newAmount.lt(paid)) {
      throw new UnprocessableEntityException(
        'La nota de crédito descuenta más de lo que queda por cobrar',
      );
    }
    let status: 'PENDING' | 'PARTIAL' | 'PAID' = 'PENDING';
    if (isSettledInGuaranies(paid, newAmount)) status = 'PAID';
    else if (paid.gt(0)) status = 'PARTIAL';
    await this.arRepository.updateAmountAndStatus(ar.id, newAmount, status, tx);
  }
}
