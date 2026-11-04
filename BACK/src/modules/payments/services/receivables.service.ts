import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ReceivableBalance,
  Receivables,
} from '../../../common/contracts/receivables.contract';
import { AccountsReceivableRepository } from '../repositories/accounts-receivable.repository';

const round2 = (n: number) => Math.round(n * 100) / 100;

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
    const amount = Number(ar.amount);
    const paid = Number(ar.paidAmount);
    return { amount, paid, outstanding: round2(Math.max(amount - paid, 0)) };
  }

  async applyCredit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
    amount: number,
  ): Promise<void> {
    if (amount <= 0) return;
    const ar = await this.arRepository.findOpenByInvoice(
      tenantId,
      invoiceId,
      tx,
    );
    if (!ar) return;
    const paid = Number(ar.paidAmount);
    const newAmount = round2(Number(ar.amount) - amount);
    if (newAmount < paid - 0.01) {
      throw new UnprocessableEntityException(
        'La nota de crédito descuenta más de lo que queda por cobrar',
      );
    }
    let status: 'PENDING' | 'PARTIAL' | 'PAID' = 'PENDING';
    if (paid >= newAmount - 0.01) status = 'PAID';
    else if (paid > 0) status = 'PARTIAL';
    await this.arRepository.updateAmountAndStatus(ar.id, newAmount, status, tx);
  }
}
