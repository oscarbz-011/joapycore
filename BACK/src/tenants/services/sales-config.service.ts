import { Injectable } from '@nestjs/common';
import { presentationsEnabledFor } from '../../common/units/dimensions';
import {
  SalesConfigRepository,
  type SalesConfigChanges,
} from '../repositories/sales-config.repository';
import { TenantsRepository } from '../repositories/tenants.repository';

@Injectable()
export class SalesConfigService {
  constructor(
    private readonly repo: SalesConfigRepository,
    private readonly tenants: TenantsRepository,
  ) {}

  /**
   * `presentationsEnabled` ya resuelto; `presentationsChosen` es lo que eligió
   * la empresa (null = sigue a su rubro).
   */
  async get(tenantId: string) {
    const [config, tenant] = await Promise.all([
      this.repo.findByTenant(tenantId),
      this.tenants.findById(tenantId),
    ]);
    const chosen = config?.presentationsEnabled ?? null;
    return {
      combosEnabled: config?.combosEnabled ?? false,
      presentationsEnabled: presentationsEnabledFor(chosen, tenant?.industry),
      presentationsChosen: chosen,
    };
  }

  async update(tenantId: string, changes: SalesConfigChanges) {
    await this.repo.upsertConfig(tenantId, changes);
    return this.get(tenantId);
  }
}
