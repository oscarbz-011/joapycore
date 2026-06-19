import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { PurchaseOrdersService } from '../services/purchase-orders.service';
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto';
import { ReceiveItemsDto } from '../dto/receive-items.dto';

@ApiTags('Procurement')
@ApiBearerAuth()
@RequiredModule('procurement')
@Controller('procurement/purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

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

  @Post(':id/confirm')
  @Permissions('procurement:update')
  @ApiOperation({ summary: 'Confirmar orden de compra' })
  confirm(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.purchaseOrdersService.confirm(tenantId, id);
  }

  @Post(':id/receive')
  @Permissions('procurement:receive')
  @ApiOperation({ summary: 'Registrar recepción de mercadería' })
  receive(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ReceiveItemsDto,
  ) {
    return this.purchaseOrdersService.receive(tenantId, id, dto);
  }
}
