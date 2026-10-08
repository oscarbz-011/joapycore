import {
  Body,
  Controller,
  Delete,
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
  CreateDeliveryRouteDto,
  ReorderRouteDto,
  RouteBoardQueryDto,
  ScheduleDeliveryDto,
  UpdateDeliveryRouteDto,
} from '../dto/delivery-route.dto';
import { DeliveryRoutesService } from '../services/delivery-routes.service';

@ApiTags('Logistics')
@ApiBearerAuth()
@RequiredModule('logistics')
@Controller('logistics/delivery-routes')
export class DeliveryRoutesController {
  constructor(private readonly service: DeliveryRoutesService) {}

  @Get('board')
  @Permissions('logistics:read')
  @ApiOperation({
    summary: 'Rutas de un día y entregas a domicilio que esperan una ruta',
  })
  board(@CurrentTenant() tenantId: string, @Query() query: RouteBoardQueryDto) {
    return this.service.board(tenantId, query.date);
  }

  @Post()
  @Permissions('logistics:assign')
  @ApiOperation({ summary: 'Crear una ruta para un día y un turno' })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDeliveryRouteDto,
  ) {
    return this.service.create(tenantId, dto, user.sub);
  }

  // Antes de las rutas con :id — "stops" no es el id de una ruta.
  @Post('stops/:noteId/unassign')
  @HttpCode(HttpStatus.OK)
  @Permissions('logistics:assign')
  @ApiOperation({ summary: 'Sacar una entrega de su ruta' })
  removeDelivery(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('noteId') noteId: string,
  ) {
    return this.service.removeDelivery(tenantId, noteId, user.sub);
  }

  @Post('stops/:noteId/schedule')
  @HttpCode(HttpStatus.OK)
  @Permissions('logistics:assign')
  @ApiOperation({
    summary: 'Programar una entrega para otro día o turno, o dejarla sin fecha',
  })
  schedule(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('noteId') noteId: string,
    @Body() dto: ScheduleDeliveryDto,
  ) {
    return this.service.schedule(tenantId, noteId, dto, user.sub);
  }

  @Patch(':id')
  @Permissions('logistics:assign')
  @ApiOperation({ summary: 'Cambiar repartidor, vehículo o nombre de la ruta' })
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryRouteDto,
  ) {
    return this.service.update(tenantId, id, dto, user.sub);
  }

  @Delete(':id')
  @Permissions('logistics:assign')
  @ApiOperation({
    summary:
      'Borrar una ruta que todavía no salió; sus entregas quedan sin ruta',
  })
  remove(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.remove(tenantId, id, user.sub);
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
