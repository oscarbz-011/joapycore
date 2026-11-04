import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { IssueCreditNoteDto, VoidInvoiceDto } from '../dto/credit-note.dto';
import { PhysicalScanDto } from '../dto/preprinted-sheet.dto';
import { CreditNotesService } from '../services/credit-notes.service';

@ApiTags('Billing')
@ApiBearerAuth()
@RequiredModule('billing')
@Controller('billing')
export class CreditNotesController {
  constructor(private readonly creditNotes: CreditNotesService) {}

  @Get('invoices/:id/credit-notes')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Notas de crédito de una factura' })
  findByInvoice(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditNotes.findByInvoice(tenantId, id);
  }

  @Get('invoices/:id/credit-note-options')
  @Permissions('billing:cancel')
  @ApiOperation({ summary: 'Lo que se puede acreditar de una factura' })
  options(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditNotes.options(tenantId, id);
  }

  @Post('invoices/:id/credit-notes')
  @Permissions('billing:cancel')
  @ApiOperation({ summary: 'Emitir una nota de crédito sobre la factura' })
  issue(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueCreditNoteDto,
  ) {
    return this.creditNotes.issue(tenantId, id, dto, user.sub);
  }

  @Post('invoices/:id/void')
  @Permissions('billing:cancel')
  @ApiOperation({
    summary:
      'Anular una factura emitida que se conserva entera, sin nota de crédito',
  })
  async voidInvoice(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidInvoiceDto,
  ) {
    await this.creditNotes.voidInvoice(tenantId, id, dto, user.sub);
    return { id };
  }

  @Get('credit-notes')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Listar notas de crédito' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.creditNotes.findAll(tenantId);
  }

  @Get('credit-notes/:id')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Detalle de una nota de crédito' })
  findOne(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditNotes.findOne(tenantId, id);
  }

  @Post('credit-notes/:id/form/print')
  @Permissions('billing:cancel')
  @ApiOperation({
    summary: 'Datos para imprimir la nota sobre la hoja del talonario',
  })
  print(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditNotes.print(tenantId, id, user.sub);
  }

  @Post('credit-notes/:id/pdf/retry')
  @Permissions('billing:cancel')
  @ApiOperation({ summary: 'Volver a generar el PDF de la nota de crédito' })
  retryPdf(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditNotes.retryPdf(tenantId, id, user.sub);
  }

  @Post('credit-notes/:id/physical-scan')
  @Permissions('billing:cancel')
  @ApiOperation({ summary: 'Adjuntar o quitar el escaneo de la nota física' })
  setPhysicalScan(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PhysicalScanDto,
  ) {
    return this.creditNotes.setPhysicalScan(tenantId, id, dto.fileId, user.sub);
  }

  @Get('customers/:id/credit')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Saldo a favor del cliente y sus movimientos' })
  customerCredit(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditNotes.customerCredit(tenantId, id);
  }
}
