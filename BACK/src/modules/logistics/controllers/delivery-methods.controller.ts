import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import {
  DecideSellerDeliveryDto,
  RegisterPickupDto,
  RequestSellerDeliveryDto,
  SellerDeliveredDto,
  SetDeliveryMethodDto,
} from '../dto/delivery-method.dto';
import { DeliveryMethodsService } from '../services/delivery-methods.service';

const actorOf = (user: JwtPayload) => ({
  userId: user.sub,
  permissions: user.permissions,
});

// Varias rutas van sin @Permissions(): las puede usar logística O el vendedor
// del pedido, y PermissionsGuard solo sabe exigir todos los permisos a la vez.
// En esos casos la verificación vive en DeliveryMethodsService (mismo criterio
// que el despacho y el recorrido).
@ApiTags('Logistics')
@ApiBearerAuth()
@RequiredModule('logistics')
@Controller('logistics/deliveries')
export class DeliveryMethodsController {
  constructor(private readonly service: DeliveryMethodsService) {}

  @Get('by-order/:saleOrderId')
  @ApiOperation({
    summary: 'Entrega de un pedido (logística o el vendedor del pedido)',
  })
  findForOrder(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('saleOrderId') saleOrderId: string,
  ) {
    return this.service.findForOrder(tenantId, saleOrderId, actorOf(user));
  }

  @Post(':id/method')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Elegir envío a domicilio o retiro en sucursal',
  })
  setMethod(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetDeliveryMethodDto,
  ) {
    return this.service.setMethod(tenantId, id, dto, actorOf(user));
  }

  @Post(':id/pickup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar que el cliente retiró el pedido' })
  registerPickup(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RegisterPickupDto,
  ) {
    return this.service.registerPickup(tenantId, id, dto, actorOf(user));
  }

  @Post(':id/seller-request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'El vendedor pide llevar el pedido en persona',
  })
  requestSellerDelivery(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RequestSellerDeliveryDto,
  ) {
    return this.service.requestSellerDelivery(tenantId, id, dto, actorOf(user));
  }

  @Post(':id/seller-request/authorize')
  @HttpCode(HttpStatus.OK)
  @Permissions('logistics:authorize')
  @ApiOperation({
    summary: 'Autorizar que el vendedor lleve el pedido (supervisor)',
  })
  authorize(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DecideSellerDeliveryDto,
  ) {
    return this.service.authorizeSellerDelivery(tenantId, id, dto, user.sub);
  }

  @Post(':id/seller-request/reject')
  @HttpCode(HttpStatus.OK)
  @Permissions('logistics:authorize')
  @ApiOperation({
    summary: 'No autorizar que el vendedor lleve el pedido (supervisor)',
  })
  reject(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DecideSellerDeliveryDto,
  ) {
    return this.service.rejectSellerDelivery(tenantId, id, dto, user.sub);
  }

  @Post(':id/seller-delivered')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'El vendedor autorizado marca el pedido como entregado',
  })
  sellerDelivered(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SellerDeliveredDto,
  ) {
    return this.service.markSellerDelivered(tenantId, id, dto, actorOf(user));
  }
}
