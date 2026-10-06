import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import {
  ApproveSupplierInvoiceDto,
  CreateSupplierInvoiceDto,
  RejectSupplierInvoiceDto,
} from '../dto/create-supplier-invoice.dto';
import { SupplierInvoicesService } from '../services/supplier-invoices.service';

@ApiTags('Procurement')
@ApiBearerAuth()
@RequiredModule('procurement')
@Controller('procurement/supplier-invoices')
export class SupplierInvoicesController {
  constructor(private readonly invoicesService: SupplierInvoicesService) {}

  @Get('invoiceable')
  @Permissions('procurement:payables:read')
  @ApiOperation({
    summary: 'Recepciones de un proveedor que todavía no tienen factura',
  })
  invoiceable(
    @CurrentTenant() tenantId: string,
    @Query('supplierId', ParseUUIDPipe) supplierId: string,
  ) {
    return this.invoicesService.invoiceable(tenantId, supplierId);
  }

  @Get(':id')
  @Permissions('procurement:payables:read')
  @ApiOperation({ summary: 'Factura de proveedor con su comparación' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(tenantId, id);
  }

  @Post()
  @Permissions('procurement:payables:register')
  @ApiOperation({
    summary:
      'Cargar la factura del proveedor sobre una o varias recepciones. Si difiere de lo recibido queda esperando aprobación',
  })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSupplierInvoiceDto,
  ) {
    return this.invoicesService.create(tenantId, dto, user.sub);
  }

  @Post(':id/approve')
  @Permissions('procurement:payables:approve')
  @ApiOperation({ summary: 'Aprobar una factura que difiere de lo recibido' })
  approve(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ApproveSupplierInvoiceDto,
  ) {
    return this.invoicesService.approve(tenantId, id, dto.note, user.sub);
  }

  @Post(':id/reject')
  @Permissions('procurement:payables:approve')
  @ApiOperation({
    summary: 'Rechazar una factura para reclamarla al proveedor',
  })
  reject(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RejectSupplierInvoiceDto,
  ) {
    return this.invoicesService.reject(tenantId, id, dto.reason, user.sub);
  }
}
