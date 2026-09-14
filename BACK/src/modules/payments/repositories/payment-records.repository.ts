import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class PaymentRecordsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.PaymentRecordUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.paymentRecord.create({ data });
  }

  findInRange(tenantId: string, start: Date, end: Date) {
    return this.prisma.paymentRecord.findMany({
      where: { tenantId, paymentDate: { gte: start, lt: end } },
      select: { amount: true, paymentMethod: true },
    });
  }

  findByAR(accountsReceivableId: string) {
    return this.prisma.paymentRecord.findMany({
      where: { accountsReceivableId },
      orderBy: { paymentDate: 'desc' },
    });
  }
}
