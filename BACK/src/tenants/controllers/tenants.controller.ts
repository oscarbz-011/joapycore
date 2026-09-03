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
import { CreateInterestComponentDto } from '../dto/create-interest-component.dto';
import { ToggleTenantModuleDto } from '../dto/toggle-tenant-module.dto';
import { UpdateCreditPlanDto } from '../dto/update-credit-plan.dto';
import { UpdateInterestComponentDto } from '../dto/update-interest-component.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';
import { UpsertCreditConfigDto } from '../dto/upsert-credit-config.dto';
import { UpsertPricingConfigDto } from '../dto/upsert-pricing-config.dto';
import { UpsertSalesConfigDto } from '../dto/upsert-sales-config.dto';
import { CreditConfigService } from '../services/credit-config.service';
import { PricingConfigService } from '../services/pricing-config.service';
import { SalesConfigService } from '../services/sales-config.service';
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
    private readonly salesConfigService: SalesConfigService,
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
  @Permissions('sales:read')
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
    return this.creditConfigService.setEnabled(
      tenantId,
      dto.isEnabled,
      dto.maxIncomePercentage,
      dto.dueDayOfMonth,
      dto.moraGraceDays,
      dto.delinquencyThresholdMonths,
    );
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
  removeCreditPlan(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.creditConfigService.removePlan(tenantId, id);
  }

  // ─── Componentes de interés/mora ─────────────────────────────────────────

  @Post('credit/interest-components')
  @Permissions('tenants:update')
  @ApiOperation({
    summary:
      'Agregar un componente de interés/mora (gastos administrativos, mora diaria, etc.)',
  })
  addInterestComponent(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateInterestComponentDto,
  ) {
    return this.creditConfigService.addComponent(tenantId, dto);
  }

  @Patch('credit/interest-components/:id')
  @Permissions('tenants:update')
  @ApiOperation({ summary: 'Actualizar un componente de interés/mora' })
  updateInterestComponent(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInterestComponentDto,
  ) {
    return this.creditConfigService.updateComponent(tenantId, id, dto);
  }

  @Delete('credit/interest-components/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('tenants:update')
  @ApiOperation({ summary: 'Eliminar un componente de interés/mora' })
  removeInterestComponent(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.creditConfigService.removeComponent(tenantId, id);
  }

  // ─── Sales config ─────────────────────────────────────────────────────────

  @Get('sales-config')
  @Permissions('sales:read')
  @ApiOperation({
    summary: 'Get the sales sub-feature configuration (combos, etc.)',
  })
  getSalesConfig(@CurrentTenant() tenantId: string) {
    return this.salesConfigService.get(tenantId);
  }

  @Put('sales-config')
  @Permissions('tenants:update')
  @ApiOperation({
    summary: 'Enable or disable sales sub-features (combos, etc.)',
  })
  setSalesConfig(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpsertSalesConfigDto,
  ) {
    return this.salesConfigService.setCombosEnabled(
      tenantId,
      dto.combosEnabled,
    );
  }
}
