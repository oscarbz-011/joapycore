import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { CreateSaleOrderDto } from '../dto/create-sale-order.dto';
import { RejectCreditDto } from '../dto/reject-credit.dto';
import { SaleOrdersService } from '../services/sale-orders.service';

@ApiTags('Sales')
@ApiBearerAuth()
@RequiredModule('sales')
@Controller('sales/orders')
export class SaleOrdersController {
  constructor(private readonly saleOrdersService: SaleOrdersService) {}

  @Get()
  @Permissions('sales:read')
  @ApiOperation({ summary: 'Listar órdenes de venta' })
  findAll(@CurrentTenant() tenantId: string, @CurrentUser() user: JwtPayload) {
    const canManage = user.permissions.includes('sales:manage');
    const sellerId = canManage ? undefined : user.sub;
    return this.saleOrdersService.findAll(tenantId, sellerId);
  }

  @Get('pending-approvals')
  @Permissions('sales:manage')
  @ApiOperation({ summary: 'Listar pedidos pendientes de aprobación de crédito' })
  findPendingApprovals(@CurrentTenant() tenantId: string) {
    return this.saleOrdersService.findPendingApprovals(tenantId);
  }

  @Get(':id')
  @Permissions('sales:read')
  @ApiOperation({ summary: 'Obtener orden de venta por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.saleOrdersService.findOne(tenantId, id);
  }

  @Post()
  @Permissions('sales:create')
  @ApiOperation({ summary: 'Crear orden de venta' })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSaleOrderDto,
  ) {
    const canManage = user.permissions.includes('sales:manage');
    return this.saleOrdersService.create(tenantId, dto, user.sub, canManage);
  }

  @Post(':id/confirm')
  @Permissions('sales:update')
  @ApiOperation({ summary: 'Confirmar orden de venta (ajusta stock y genera factura)' })
  confirm(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.saleOrdersService.confirm(tenantId, id, user.sub);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions('sales:cancel')
  @ApiOperation({ summary: 'Cancelar orden de venta' })
  cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.saleOrdersService.cancel(tenantId, id, user.sub);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Permissions('sales:manage')
  @ApiOperation({ summary: 'Aprobar crédito de un pedido' })
  approveCredit(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.saleOrdersService.approveCredit(tenantId, id, user.sub);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Permissions('sales:manage')
  @ApiOperation({ summary: 'Rechazar crédito de un pedido' })
  rejectCredit(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RejectCreditDto,
  ) {
    return this.saleOrdersService.rejectCredit(tenantId, id, dto.reason, user.sub);
  }
}
