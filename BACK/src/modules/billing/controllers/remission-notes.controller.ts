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
import { PhysicalScanDto } from '../dto/preprinted-sheet.dto';
import {
  IssueSaleRemissionDto,
  IssueTransferRemissionDto,
  VoidRemissionDto,
} from '../dto/remission-note.dto';
import { RemissionNotesService } from '../services/remission-notes.service';

@ApiTags('Billing')
@ApiBearerAuth()
@RequiredModule('billing')
@Controller('billing')
export class RemissionNotesController {
  constructor(private readonly remissions: RemissionNotesService) {}

  @Get('remission-notes')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Listar notas de remisión' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.remissions.findAll(tenantId);
  }

  @Get('remission-notes/transfer-options')
  @Permissions('billing:issue', 'inventory:movements:create')
  @ApiOperation({
    summary: 'Depósitos y series para trasladar mercadería entre sucursales',
  })
  transferOptions(@CurrentTenant() tenantId: string) {
    return this.remissions.transferOptions(tenantId);
  }

  @Post('remission-notes/transfer')
  @Permissions('billing:issue', 'inventory:movements:create')
  @ApiOperation({
    summary:
      'Trasladar mercadería entre depósitos con su nota de remisión (obligatoria entre sucursales)',
  })
  issueTransfer(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: IssueTransferRemissionDto,
  ) {
    return this.remissions.issueTransfer(tenantId, dto, user.sub);
  }

  @Get('remission-notes/:id')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Detalle de una nota de remisión' })
  findOne(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.remissions.findOne(tenantId, id);
  }

  @Post('remission-notes/:id/void')
  @Permissions('billing:cancel')
  @ApiOperation({
    summary: 'Anular una nota de remisión; un traslado devuelve el stock',
  })
  voidNote(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidRemissionDto,
  ) {
    return this.remissions.voidNote(tenantId, id, dto, user.sub);
  }

  @Post('remission-notes/:id/pdf/retry')
  @Permissions('billing:issue')
  @ApiOperation({ summary: 'Volver a generar el PDF de la nota de remisión' })
  retryPdf(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.remissions.retryPdf(tenantId, id, user.sub);
  }

  @Post('remission-notes/:id/physical-scan')
  @Permissions('billing:issue')
  @ApiOperation({ summary: 'Adjuntar o quitar el escaneo de la nota física' })
  setPhysicalScan(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PhysicalScanDto,
  ) {
    return this.remissions.setPhysicalScan(tenantId, id, dto.fileId, user.sub);
  }

  @Get('invoices/:id/remission-notes')
  @Permissions('billing:read')
  @ApiOperation({ summary: 'Notas de remisión de una factura' })
  findByInvoice(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.remissions.findByInvoice(tenantId, id);
  }

  @Get('invoices/:id/remission-options')
  @Permissions('billing:issue')
  @ApiOperation({ summary: 'Lo que se puede enviar de una factura' })
  saleOptions(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.remissions.saleOptions(tenantId, id);
  }

  @Post('invoices/:id/remission-notes')
  @Permissions('billing:issue')
  @ApiOperation({
    summary: 'Emitir la nota de remisión de una venta (opcional, art. 38)',
  })
  issueForSale(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueSaleRemissionDto,
  ) {
    return this.remissions.issueForSale(tenantId, id, dto, user.sub);
  }
}
