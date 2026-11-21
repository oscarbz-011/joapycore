import { Injectable } from '@nestjs/common';
import type { StockReportSource } from '../../../common/contracts/report-sources.contract';
import { TenantModulesCache } from '../../../tenants/services/tenant-modules.cache';
import { inventoryManifest } from '../module.manifest';
import { StockReportRepository } from '../repositories/stock-report.repository';

@Injectable()
export class StockReportSourceService implements StockReportSource {
  constructor(
    private readonly repository: StockReportRepository,
    private readonly modules: TenantModulesCache,
  ) {}

  async productsWithMovements(tenantId: string) {
    if (!(await this.modules.isActive(tenantId, inventoryManifest.key))) {
      return [];
    }
    return this.repository.findProductsWithMovements(tenantId);
  }
}
