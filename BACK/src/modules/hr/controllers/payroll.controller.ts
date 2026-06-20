import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { UpdatePayrollConfigDto } from '../dto/payroll-config.dto';
import { PayrollService } from '../services/payroll.service';

@ApiTags('HR')
@ApiBearerAuth()
@RequiredModule('hr')
@Controller('hr/payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('config')
  @Permissions('hr:config:manage')
  @ApiOperation({ summary: 'Get payroll configuration (IPS rates, minimum wage)' })
  getConfig(@CurrentTenant() tenantId: string) {
    return this.payrollService.getConfig(tenantId);
  }

  @Put('config')
  @Permissions('hr:config:manage')
  @ApiOperation({ summary: 'Update payroll configuration' })
  updateConfig(@CurrentTenant() tenantId: string, @Body() dto: UpdatePayrollConfigDto) {
    return this.payrollService.updateConfig(tenantId, dto);
  }

  @Get('records')
  @Permissions('hr:payroll:run')
  @ApiOperation({ summary: 'List payroll records' })
  listRecords(@CurrentTenant() tenantId: string) {
    return this.payrollService.listRecords(tenantId);
  }

  @Get('records/:id')
  @Permissions('hr:payroll:run')
  @ApiOperation({ summary: 'Get payroll record with items' })
  getRecord(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.payrollService.getRecord(tenantId, id);
  }

  @Post('records/run')
  @Permissions('hr:payroll:run')
  @ApiOperation({ summary: 'Liquidar nómina para un período (formato YYYY-MM)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['period'],
      properties: { period: { type: 'string', example: '2025-12' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Liquidación generada en estado DRAFT' })
  @ApiResponse({ status: 422, description: 'Ya existe una liquidación para ese período' })
  runPayroll(@CurrentTenant() tenantId: string, @Body() body: { period: string }) {
    return this.payrollService.runPayroll(tenantId, body.period);
  }

  @Post('records/:id/pay')
  @Permissions('hr:payroll:pay')
  @ApiOperation({ summary: 'Marcar liquidación como pagada' })
  @ApiParam({ name: 'id', description: 'PayrollRecord UUID' })
  @ApiResponse({ status: 201, description: 'Liquidación marcada como PAID' })
  @ApiResponse({ status: 422, description: 'La liquidación ya fue pagada' })
  markPaid(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.payrollService.markPaid(tenantId, id);
  }
}
