import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ToggleTenantModuleDto } from '../dto/toggle-tenant-module.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';
import { TenantModulesService } from '../services/tenant-modules.service';
import { TenantsService } from '../services/tenants.service';

@ApiTags('Tenants')
@ApiBearerAuth()
@Controller('tenants/me')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly tenantModulesService: TenantModulesService,
  ) {}

  @Get()
  @Permissions('tenants:read')
  @ApiOperation({ summary: 'Get the current tenant' })
  getCurrentTenant(@CurrentTenant() tenantId: string) {
    return this.tenantsService.getById(tenantId);
  }

  @Patch()
  @Permissions('tenants:update')
  @ApiOperation({ summary: 'Update the current tenant' })
  updateCurrentTenant(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(tenantId, dto);
  }

  @Get('modules')
  @Permissions('tenants:read')
  @ApiOperation({
    summary: 'List modules and their active state for the current tenant',
  })
  listModules(@CurrentTenant() tenantId: string) {
    return this.tenantModulesService.list(tenantId);
  }

  @Patch('modules/:moduleName')
  @Permissions('tenants:modules:manage')
  @ApiOperation({
    summary: 'Activate or deactivate a module for the current tenant',
  })
  toggleModule(
    @CurrentTenant() tenantId: string,
    @Param('moduleName') moduleName: string,
    @Body() dto: ToggleTenantModuleDto,
  ) {
    return this.tenantModulesService.setActive(
      tenantId,
      moduleName,
      dto.active,
    );
  }
}
