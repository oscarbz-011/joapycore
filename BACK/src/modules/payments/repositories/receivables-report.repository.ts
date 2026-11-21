import { Injectable } from '@nestjs/common';
import { RECEIVABLES_REPORT_INCLUDE } from '../../../common/contracts/report-sources.contract';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ReceivablesReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.accountsReceivable.findMany({
      where: { tenantId },
      include: RECEIVABLES_REPORT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }
}
