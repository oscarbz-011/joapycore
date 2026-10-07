import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { PurchaseOrdersService } from '../services/purchase-orders.service';
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto';
import { CancelPurchaseOrderDto } from '../dto/cancel-purchase-order.dto';
import { EmailPurchaseOrderDto } from '../dto/email-purchase-order.dto';
import { PurchaseOrderDocumentService } from '../services/purchase-order-document.service';

@ApiTags('Procurement')
@ApiBearerAuth()
@RequiredModule('procurement')
@Controller('procurement/purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly documentService: PurchaseOrderDocumentService,
  ) {}

  @Get()
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'Listar órdenes de compra' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.purchaseOrdersService.findAll(tenantId);
  }

  @Get(':id')
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'Obtener orden de compra por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.purchaseOrdersService.findOne(tenantId, id);
  }

  @Post()
  @Permissions('procurement:create')
  @ApiOperation({ summary: 'Crear orden de compra' })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.create(tenantId, user.sub, dto);
  }

  @Post(':id/pdf')
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'Obtener el PDF de la orden, generándolo si falta' })
  pdf(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.documentService.ensurePdf(tenantId, id, user.sub);
  }

  @Post(':id/email')
  @Permissions('procurement:update')
  @ApiOperation({ summary: 'Enviar el PDF de la orden al proveedor por email' })
  email(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: EmailPurchaseOrderDto,
  ) {
    return this.documentService.emailToSupplier(tenantId, id, dto.to, user.sub);
  }

  @Post(':id/send')
  @Permissions('procurement:update')
  @ApiOperation({ summary: 'Marcar la orden como enviada al proveedor' })
  send(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.purchaseOrdersService.send(tenantId, id, user.sub);
  }

  @Post(':id/cancel')
  @Permissions('procurement:update')
  @ApiOperation({ summary: 'Cancelar una orden sin mercadería recibida' })
  cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CancelPurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.cancel(
      tenantId,
      id,
      dto.reason,
      user.sub,
    );
  }

  @Post(':id/confirm')
  @Permissions('procurement:update')
  @ApiOperation({ summary: 'Confirmar orden de compra' })
  confirm(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.purchaseOrdersService.confirm(tenantId, id, user.sub);
  }
}
