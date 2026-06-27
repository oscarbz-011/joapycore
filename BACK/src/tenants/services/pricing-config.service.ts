import { Injectable } from '@nestjs/common';
import { UpsertPricingConfigDto } from '../dto/upsert-pricing-config.dto';
import { PricingConfigRepository } from '../repositories/pricing-config.repository';

@Injectable()
export class PricingConfigService {
  constructor(private readonly repo: PricingConfigRepository) {}

  get(tenantId: string) {
    return this.repo.findByTenant(tenantId);
  }

  upsert(tenantId: string, dto: UpsertPricingConfigDto) {
    return this.repo.upsert(tenantId, {
      markupMethod: dto.markupMethod,
      defaultMarkup: dto.defaultMarkup,
    });
  }
}
