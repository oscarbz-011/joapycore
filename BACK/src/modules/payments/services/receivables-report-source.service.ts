import { Injectable } from '@nestjs/common';
import type { ReceivablesReportSource } from '../../../common/contracts/report-sources.contract';
import { TenantModulesCache } from '../../../tenants/services/tenant-modules.cache';
import { paymentsManifest } from '../module.manifest';
import { ReceivablesReportRepository } from '../repositories/receivables-report.repository';

@Injectable()
export class ReceivablesReportSourceService implements ReceivablesReportSource {
  constructor(
    private readonly repository: ReceivablesReportRepository,
    private readonly modules: TenantModulesCache,
  ) {}

  async receivables(tenantId: string) {
    if (!(await this.modules.isActive(tenantId, paymentsManifest.key))) {
      return [];
    }
    return this.repository.findAll(tenantId);
  }
}
