import { Module } from '@nestjs/common';
import { TenantsController } from './controllers/tenants.controller';
import { TenantModulesRepository } from './repositories/tenant-modules.repository';
import { TenantsRepository } from './repositories/tenants.repository';
import { TenantModulesService } from './services/tenant-modules.service';
import { TenantsService } from './services/tenants.service';

@Module({
  controllers: [TenantsController],
  providers: [
    TenantsRepository,
    TenantModulesRepository,
    TenantsService,
    TenantModulesService,
  ],
  exports: [
    TenantsRepository,
    TenantModulesRepository,
    TenantsService,
    TenantModulesService,
  ],
})
export class TenantsModule {}
