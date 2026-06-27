import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CreateCreditPlanDto } from '../dto/create-credit-plan.dto';
import { ToggleTenantModuleDto } from '../dto/toggle-tenant-module.dto';
import { UpdateCreditPlanDto } from '../dto/update-credit-plan.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';
import { UpsertCreditConfigDto } from '../dto/upsert-credit-config.dto';
import { UpsertPricingConfigDto } from '../dto/upsert-pricing-config.dto';
import { CreditConfigService } from '../services/credit-config.service';
import { PricingConfigService } from '../services/pricing-config.service';
import { TenantModulesService } from '../services/tenant-modules.service';
import { TenantsService } from '../services/tenants.service';

@ApiTags('Tenants')
@ApiBearerAuth()
@Controller('tenants/me')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly tenantModulesService: TenantModulesService,
    private readonly pricingConfigService: PricingConfigService,
    private readonly creditConfigService: CreditConfigService,
  ) {}

  // ─── Tenant ───────────────────────────────────────────────────────────────

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

  // ─── Modules ──────────────────────────────────────────────────────────────

  @Get('modules')
  @Permissions('tenants:read')
  @ApiOperation({ summary: 'List modules and their active state for the current tenant' })
  listModules(@CurrentTenant() tenantId: string) {
    return this.tenantModulesService.list(tenantId);
  }

  @Patch('modules/:moduleName')
  @Permissions('tenants:modules:manage')
  @ApiOperation({ summary: 'Activate or deactivate a module for the current tenant' })
  toggleModule(
    @CurrentTenant() tenantId: string,
    @Param('moduleName') moduleName: string,
    @Body() dto: ToggleTenantModuleDto,
  ) {
    return this.tenantModulesService.setActive(tenantId, moduleName, dto.active);
  }

  // ─── Pricing config ───────────────────────────────────────────────────────

  @Get('pricing')
  @Permissions('tenants:update')
  @ApiOperation({ summary: 'Get the pricing (markup) configuration' })
  getPricingConfig(@CurrentTenant() tenantId: string) {
    return this.pricingConfigService.get(tenantId);
  }

  @Put('pricing')
  @Permissions('tenants:update')
  @ApiOperation({ summary: 'Create or update the pricing configuration' })
  upsertPricingConfig(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpsertPricingConfigDto,
  ) {
    return this.pricingConfigService.upsert(tenantId, dto);
  }

  // ─── Credit config ────────────────────────────────────────────────────────

  @Get('credit')
  @Permissions('tenants:update')
  @ApiOperation({ summary: 'Get the credit configuration with all plans' })
  getCreditConfig(@CurrentTenant() tenantId: string) {
    return this.creditConfigService.get(tenantId);
  }

  @Put('credit')
  @Permissions('tenants:update')
  @ApiOperation({ summary: 'Enable or disable credit sales for the tenant' })
  setCreditEnabled(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpsertCreditConfigDto,
  ) {
    return this.creditConfigService.setEnabled(tenantId, dto.isEnabled);
  }

  @Post('credit/plans')
  @Permissions('tenants:update')
  @ApiOperation({ summary: 'Add a credit plan (installments + interest rate)' })
  addCreditPlan(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateCreditPlanDto,
  ) {
    return this.creditConfigService.addPlan(tenantId, dto);
  }

  @Patch('credit/plans/:id')
  @Permissions('tenants:update')
  @ApiOperation({ summary: 'Update a credit plan' })
  updateCreditPlan(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCreditPlanDto,
  ) {
    return this.creditConfigService.updatePlan(tenantId, id, dto);
  }

  @Delete('credit/plans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('tenants:update')
  @ApiOperation({ summary: 'Remove a credit plan' })
  removeCreditPlan(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.creditConfigService.removePlan(tenantId, id);
  }
}
