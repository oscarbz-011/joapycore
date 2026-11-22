import { Injectable } from '@nestjs/common';
import { STOCK_REPORT_INCLUDE } from '../../../common/contracts/report-sources.contract';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class StockReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProductsWithMovements(tenantId: string) {
    return this.prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      include: STOCK_REPORT_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }
}
