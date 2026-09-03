import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class SupplierPaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.SupplierPaymentUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.supplierPayment.create({ data });
  }
}
