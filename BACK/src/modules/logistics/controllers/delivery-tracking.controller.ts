import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { DeliveryTrackingService } from '../services/delivery-tracking.service';
import { AssignDeliveryDto } from '../dto/assign-delivery.dto';
import { RecordTrackingEventDto } from '../dto/record-tracking-event.dto';

@ApiTags('Logistics')
@ApiBearerAuth()
@RequiredModule('logistics')
@Controller('logistics')
export class DeliveryTrackingController {
  constructor(private readonly service: DeliveryTrackingService) {}

  @Get('couriers')
  @Permissions('logistics:assign')
  @ApiOperation({ summary: 'Listar empleados disponibles para asignar entregas' })
  listCouriers(@CurrentTenant() tenantId: string) {
    return this.service.listCouriers(tenantId);
  }

  @Patch('deliveries/:id/assign')
  @Permissions('logistics:assign')
  @ApiOperation({ summary: 'Asignar una entrega a un empleado, repartidor externo o courier' })
  assign(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignDeliveryDto,
  ) {
    return this.service.assign(tenantId, id, dto, user.sub);
  }

  @Get('deliveries/mine')
  @Permissions('logistics:track')
  @ApiOperation({ summary: 'Listar mis entregas asignadas (vista del repartidor)' })
  findMine(@CurrentTenant() tenantId: string, @CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.service.findMine(tenantId, user.sub, status);
  }

  // Sin @Permissions(): la verificación (logistics:manage O logistics:track,
  // más pertenencia si es track) vive en el servicio — ver DeliveryTrackingService.
  @Post('deliveries/:id/tracking-events')
  @ApiOperation({ summary: 'Registrar un checkpoint del recorrido — también marca "entregado"' })
  recordTrackingEvent(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RecordTrackingEventDto,
  ) {
    return this.service.recordTrackingEvent(tenantId, id, dto, user.sub, user.permissions);
  }

  @Get('deliveries/:id/tracking-events')
  @Permissions('logistics:read')
  @ApiOperation({ summary: 'Listar el recorrido registrado de una entrega' })
  listTrackingEvents(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.listTrackingEvents(tenantId, id);
  }
}
