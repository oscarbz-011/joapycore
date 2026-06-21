import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class PaymentRecordsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.PaymentRecordUncheckedCreateInput) {
    return this.prisma.paymentRecord.create({ data });
  }

  findByAR(accountsReceivableId: string) {
    return this.prisma.paymentRecord.findMany({
      where: { accountsReceivableId },
      orderBy: { paymentDate: 'desc' },
    });
  }
}
