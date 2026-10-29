import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { CreateBillingSeriesDto } from '../dto/create-billing-series.dto';
import { UpdateBillingSeriesDto } from '../dto/update-billing-series.dto';
import { BillingSeriesService } from '../services/billing-series.service';

@ApiTags('Billing')
@ApiBearerAuth()
@RequiredModule('billing')
@Controller('billing/series')
export class BillingSeriesController {
  constructor(private readonly seriesService: BillingSeriesService) {}

  @Get()
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Listar series de facturación (timbrados)' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.seriesService.findAll(tenantId);
  }

  @Get(':id')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Obtener una serie de facturación' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.seriesService.findOne(tenantId, id);
  }

  @Post()
  @Permissions('billing:series:manage')
  @ApiOperation({ summary: 'Crear una serie de facturación' })
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateBillingSeriesDto,
  ) {
    return this.seriesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('billing:series:manage')
  @ApiOperation({
    summary: 'Actualizar o desactivar una serie de facturación',
  })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBillingSeriesDto,
  ) {
    return this.seriesService.update(tenantId, id, dto);
  }
}
