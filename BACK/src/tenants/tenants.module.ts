import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { TenantsController } from './controllers/tenants.controller';
import { CreditConfigRepository } from './repositories/credit-config.repository';
import { PricingConfigRepository } from './repositories/pricing-config.repository';
import { SalesConfigRepository } from './repositories/sales-config.repository';
import { TenantModulesRepository } from './repositories/tenant-modules.repository';
import { TenantsRepository } from './repositories/tenants.repository';
import { CreditConfigService } from './services/credit-config.service';
import { PricingConfigService } from './services/pricing-config.service';
import { SalesConfigService } from './services/sales-config.service';
import { TenantModulesCache } from './services/tenant-modules.cache';
import { TenantModulesService } from './services/tenant-modules.service';
import { TenantsService } from './services/tenants.service';

@Module({
  imports: [FilesModule],
  controllers: [TenantsController],
  providers: [
    TenantsRepository,
    TenantModulesRepository,
    PricingConfigRepository,
    CreditConfigRepository,
    SalesConfigRepository,
    TenantsService,
    TenantModulesService,
    TenantModulesCache,
    PricingConfigService,
    CreditConfigService,
    SalesConfigService,
  ],
  exports: [
    TenantsRepository,
    TenantModulesRepository,
    PricingConfigRepository,
    CreditConfigRepository,
    SalesConfigRepository,
    TenantsService,
    TenantModulesService,
    TenantModulesCache,
    PricingConfigService,
    CreditConfigService,
    SalesConfigService,
  ],
})
export class TenantsModule {}
