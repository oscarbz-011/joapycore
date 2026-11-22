import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { SALES_REPORT_INCLUDE } from '../../../common/contracts/report-sources.contract';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class SalesReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOrders(where: Prisma.SaleOrderWhereInput) {
    return this.prisma.saleOrder.findMany({
      where,
      include: SALES_REPORT_INCLUDE,
      orderBy: { orderDate: 'asc' },
    });
  }
}
