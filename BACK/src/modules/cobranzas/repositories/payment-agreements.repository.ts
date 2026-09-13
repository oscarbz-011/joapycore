import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class PaymentAgreementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          documentNumber: true,
        },
      },
      loan: { select: { id: true, principal: true, totalAmount: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    };
  }

  findAll(tenantId: string, customerId?: string) {
    return this.prisma.paymentAgreement.findMany({
      where: { tenantId, ...(customerId ? { customerId } : {}) },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.paymentAgreement.findFirst({
      where: { id, tenantId },
      include: this.include,
    });
  }

  create(data: Prisma.PaymentAgreementUncheckedCreateInput) {
    return this.prisma.paymentAgreement.create({ data, include: this.include });
  }

  update(id: string, data: Prisma.PaymentAgreementUncheckedUpdateInput) {
    return this.prisma.paymentAgreement.update({
      where: { id },
      data,
      include: this.include,
    });
  }
}
