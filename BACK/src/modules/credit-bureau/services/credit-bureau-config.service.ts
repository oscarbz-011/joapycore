import { Injectable } from '@nestjs/common';
import { CreditBureauRepository } from '../repositories/credit-bureau.repository';
import { UpdateCreditBureauConfigDto } from '../dto/update-credit-bureau-config.dto';

@Injectable()
export class CreditBureauConfigService {
  constructor(private readonly repo: CreditBureauRepository) {}

  async getConfig(tenantId: string) {
    const cfg = await this.repo.findConfigByTenant(tenantId);
    if (!cfg) {
      return {
        isEnabled: false,
        checkFrequency: 'EVERY_REQUEST' as const,
        providerName: 'manual',
      };
    }
    return {
      isEnabled: cfg.isEnabled,
      checkFrequency: cfg.checkFrequency,
      providerName: cfg.providerName,
    };
  }

  async updateConfig(tenantId: string, dto: UpdateCreditBureauConfigDto) {
    await this.repo.upsertConfig(tenantId, {
      isEnabled: dto.isEnabled,
      checkFrequency: dto.checkFrequency,
    });
    return this.getConfig(tenantId);
  }
}
