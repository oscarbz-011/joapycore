import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { ReportsService } from '../services/reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Reporte de ventas por período' })
  salesReport(
    @CurrentTenant() tenantId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.reportsService.salesReport(tenantId, dateFrom, dateTo);
  }

  @Get('stock')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Reporte de stock actual' })
  stockReport(@CurrentTenant() tenantId: string) {
    return this.reportsService.stockReport(tenantId);
  }

  @Get('receivables')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Reporte de cuentas por cobrar' })
  receivablesReport(@CurrentTenant() tenantId: string) {
    return this.reportsService.receivablesReport(tenantId);
  }
}
