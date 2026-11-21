import { Injectable } from '@nestjs/common';
import type { SalesReportSource } from '../../../common/contracts/report-sources.contract';
import { CLOSED_SALE_STATUSES } from '../../../common/constants/sale-status.constant';
import { TenantModulesCache } from '../../../tenants/services/tenant-modules.cache';
import { salesManifest } from '../module.manifest';
import { SalesReportRepository } from '../repositories/sales-report.repository';

@Injectable()
export class SalesReportSourceService implements SalesReportSource {
  constructor(
    private readonly repository: SalesReportRepository,
    private readonly modules: TenantModulesCache,
  ) {}

  async closedOrders(tenantId: string, range: { from?: Date; to?: Date }) {
    if (!(await this.modules.isActive(tenantId, salesManifest.key))) return [];
    return this.repository.findOrders({
      tenantId,
      status: { in: CLOSED_SALE_STATUSES },
      ...(range.from || range.to
        ? {
            orderDate: {
              ...(range.from && { gte: range.from }),
              ...(range.to && { lte: range.to }),
            },
          }
        : {}),
    });
  }
}
