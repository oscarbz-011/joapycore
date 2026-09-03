import { Injectable } from '@nestjs/common';
import { DelinquencyReportStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const WITH_RELATIONS = {
  customer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      documentType: true,
      documentNumber: true,
    },
  },
  loan: {
    select: { id: true, totalAmount: true, saleOrderId: true },
  },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class DelinquencyReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, status?: DelinquencyReportStatus) {
    return this.prisma.delinquencyReport.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: WITH_RELATIONS,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.delinquencyReport.findFirst({
      where: { id, tenantId },
      include: WITH_RELATIONS,
    });
  }

  updateStatus(
    id: string,
    data: {
      status: DelinquencyReportStatus;
      reference?: string;
      notes?: string;
      reviewedById: string;
    },
  ) {
    return this.prisma.delinquencyReport.update({
      where: { id },
      data: { ...data, reviewedAt: new Date() },
      include: WITH_RELATIONS,
    });
  }
}
