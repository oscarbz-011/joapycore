import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

/** Saldo a favor de los clientes y dinero devuelto. */
@Injectable()
export class CreditSettlementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  addCustomerCredit(
    data: Prisma.CustomerCreditEntryUncheckedCreateInput,
    client: PrismaClientOrTx,
  ) {
    return client.customerCreditEntry.create({ data, select: { id: true } });
  }

  createRefund(
    data: Prisma.BillingRefundUncheckedCreateInput,
    client: PrismaClientOrTx,
  ) {
    return client.billingRefund.create({ data, select: { id: true } });
  }

  async customerBalance(tenantId: string, customerId: string): Promise<number> {
    const result = await this.prisma.customerCreditEntry.aggregate({
      where: { tenantId, customerId },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  }

  customerEntries(tenantId: string, customerId: string) {
    return this.prisma.customerCreditEntry.findMany({
      where: { tenantId, customerId },
      select: {
        id: true,
        amount: true,
        source: true,
        note: true,
        createdAt: true,
        creditNote: {
          select: { id: true, numberPrefix: true, number: true },
        },
        invoice: {
          select: { id: true, invoicePrefix: true, invoiceNumber: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
