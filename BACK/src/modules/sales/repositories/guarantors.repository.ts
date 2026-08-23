import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class GuarantorsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySaleOrder(tenantId: string, saleOrderId: string) {
    return this.prisma.guarantor.findMany({
      where: { tenantId, saleOrderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(data: Prisma.GuarantorUncheckedCreateInput) {
    return this.prisma.guarantor.create({ data });
  }
}
