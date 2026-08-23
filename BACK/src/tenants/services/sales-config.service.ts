import { Injectable } from '@nestjs/common';
import { SalesConfigRepository } from '../repositories/sales-config.repository';

@Injectable()
export class SalesConfigService {
  constructor(private readonly repo: SalesConfigRepository) {}

  get(tenantId: string) {
    return this.repo.findByTenant(tenantId);
  }

  setCombosEnabled(tenantId: string, combosEnabled: boolean) {
    return this.repo.upsertConfig(tenantId, combosEnabled);
  }
}
