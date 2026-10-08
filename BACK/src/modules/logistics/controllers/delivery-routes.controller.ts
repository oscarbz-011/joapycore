import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  AddRouteDeliveryDto,
  FailDeliveryDto,
  ListDeliveryRoutesDto,
  ReorderRouteDto,
  StartRouteDto,
  UpdateDeliveryRouteDto,
} from '../dto/delivery-route.dto';
import { DeliveryRoutesService } from '../services/delivery-routes.service';

const actorOf = (user: JwtPayload) => ({
  userId: user.sub,
  permissions: user.permissions,
});

// Iniciar la ruta y registrar una entrega no realizada van sin
// @Permissions(): los hace logística O el repartidor de la ruta, y
// PermissionsGuard solo sabe exigir todos los permisos a la vez. La
// verificación vive en DeliveryRoutesService.
@ApiTags('Logistics')
@ApiBearerAuth()
@RequiredModule('logistics')
@Controller('logistics/delivery-routes')
export class DeliveryRoutesController {
  constructor(private readonly service: DeliveryRoutesService) {}

  @Get()
  @Permissions('logistics:read')
  @ApiOperation({
    summary: 'Rutas de entrega, de la más reciente a la más vieja',
  })
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListDeliveryRoutesDto,
  ) {
    return this.service.list(tenantId, query);
  }

  // Las rutas literales van antes de las de :id.
  @Get('mine')
  @Permissions('logistics:track')
  @ApiOperation({ summary: 'Rutas del repartidor que todavía no terminaron' })
  findMine(@CurrentTenant() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.service.findMine(tenantId, user.sub);
  }

  @Get('unplanned')
  @Permissions('logistics:read')
  @ApiOperation({
    summary: 'Entregas a domicilio pendientes que no están en ninguna ruta',
  })
  findUnplanned(@CurrentTenant() tenantId: string) {
    return this.service.findUnplanned(tenantId);
  }

  @Post('stops/:noteId/unassign')
  @HttpCode(HttpStatus.OK)
  @Permissions('logistics:assign')
  @ApiOperation({
    summary: 'Sacar de su ruta una entrega que todavía no salió',
  })
  removeDelivery(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('noteId') noteId: string,
  ) {
    return this.service.removeDelivery(tenantId, noteId, user.sub);
  }

  @Post('stops/:noteId/fail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Registrar que no se pudo entregar (logística o el repartidor de la ruta)',
  })
  failDelivery(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('noteId') noteId: string,
    @Body() dto: FailDeliveryDto,
  ) {
    return this.service.failDelivery(tenantId, noteId, dto, actorOf(user));
  }

  @Get(':id')
  @Permissions('logistics:read')
  @ApiOperation({ summary: 'Una ruta con sus paradas y su historial' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Patch(':id')
  @Permissions('logistics:assign')
  @ApiOperation({ summary: 'Cambiar repartidor, vehículo o fecha de la ruta' })
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryRouteDto,
  ) {
    return this.service.update(tenantId, id, dto, user.sub);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar la ruta (logística o el repartidor de la ruta)',
  })
  start(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: StartRouteDto,
  ) {
    return this.service.start(tenantId, id, dto, actorOf(user));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions('logistics:assign')
  @ApiOperation({
    summary: 'Cancelar una ruta que no salió; sus entregas quedan sin ruta',
  })
  cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.cancel(tenantId, id, user.sub);
  }

  @Post(':id/stops')
  @HttpCode(HttpStatus.OK)
  @Permissions('logistics:assign')
  @ApiOperation({ summary: 'Sumar una entrega a la ruta o traerla de otra' })
  addDelivery(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AddRouteDeliveryDto,
  ) {
    return this.service.addDelivery(tenantId, id, dto, user.sub);
  }

  @Post(':id/order')
  @HttpCode(HttpStatus.OK)
  @Permissions('logistics:assign')
  @ApiOperation({ summary: 'Cambiar el orden de las paradas' })
  reorder(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReorderRouteDto,
  ) {
    return this.service.reorder(tenantId, id, dto, user.sub);
  }
}
