import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { InvoicesService } from '../services/invoices.service';

@ApiTags('Billing')
@ApiBearerAuth()
@RequiredModule('billing')
@Controller('billing/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Listar facturas' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.invoicesService.findAll(tenantId);
  }

  @Get(':id')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Obtener factura por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(tenantId, id);
  }

  @Post(':id/cancel')
  @Permissions('billing:cancel')
  @ApiOperation({ summary: 'Cancelar factura' })
  cancel(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.invoicesService.cancel(tenantId, id);
  }
}
