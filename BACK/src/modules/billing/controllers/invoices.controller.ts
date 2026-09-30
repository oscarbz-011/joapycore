import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { CancelInvoiceDto } from '../dto/cancel-invoice.dto';
import { IssueInvoiceDto } from '../dto/issue-invoice.dto';
import { InvoicesService } from '../services/invoices.service';

@ApiTags('Billing')
@ApiBearerAuth()
@RequiredModule('billing')
@Controller('billing')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get('invoices')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Listar facturas' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.invoicesService.findAll(tenantId);
  }

  @Get('invoices/:id')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Obtener factura por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(tenantId, id);
  }

  @Post('invoices/:id/issue')
  @Permissions('billing:issue')
  @ApiOperation({ summary: 'Emitir factura borrador (PENDING → ISSUED)' })
  issue(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: IssueInvoiceDto,
  ) {
    return this.invoicesService.issue(tenantId, id, dto, user.sub);
  }

  @Post('invoices/:id/pdf/retry')
  @Permissions('billing:issue')
  @ApiOperation({ summary: 'Regenerar el PDF faltante de una factura emitida' })
  retryPdf(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.invoicesService.retryPdf(tenantId, id, user.sub);
  }

  @Post('invoices/:id/cancel')
  @Permissions('billing:cancel')
  @ApiOperation({
    summary: 'Cancelar factura (genera nota de crédito si estaba emitida)',
  })
  cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CancelInvoiceDto,
  ) {
    return this.invoicesService.cancel(tenantId, id, dto.reason, user.sub);
  }

  @Get('credit-notes')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Listar notas de crédito' })
  findCreditNotes(@CurrentTenant() tenantId: string) {
    return this.invoicesService.findCreditNotes(tenantId);
  }
}
