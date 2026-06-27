import { Module } from '@nestjs/common';
import { TenantsController } from './controllers/tenants.controller';
import { CreditConfigRepository } from './repositories/credit-config.repository';
import { PricingConfigRepository } from './repositories/pricing-config.repository';
import { TenantModulesRepository } from './repositories/tenant-modules.repository';
import { TenantsRepository } from './repositories/tenants.repository';
import { CreditConfigService } from './services/credit-config.service';
import { PricingConfigService } from './services/pricing-config.service';
import { TenantModulesService } from './services/tenant-modules.service';
import { TenantsService } from './services/tenants.service';

@Module({
  controllers: [TenantsController],
  providers: [
    TenantsRepository,
    TenantModulesRepository,
    PricingConfigRepository,
    CreditConfigRepository,
    TenantsService,
    TenantModulesService,
    PricingConfigService,
    CreditConfigService,
  ],
  exports: [
    TenantsRepository,
    TenantModulesRepository,
    PricingConfigRepository,
    CreditConfigRepository,
    TenantsService,
    TenantModulesService,
    PricingConfigService,
    CreditConfigService,
  ],
})
export class TenantsModule {}
