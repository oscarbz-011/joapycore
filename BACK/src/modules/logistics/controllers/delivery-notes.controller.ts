import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { DispatchDeliveryDto } from '../dto/dispatch-delivery.dto';
import { DeliveryNotesService } from '../services/delivery-notes.service';

@ApiTags('Logistics')
@ApiBearerAuth()
@RequiredModule('logistics')
@Controller('logistics/deliveries')
export class DeliveryNotesController {
  constructor(private readonly service: DeliveryNotesService) {}

  @Get()
  @Permissions('logistics:read')
  @ApiOperation({ summary: 'Listar notas de entrega' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'],
  })
  findAll(@CurrentTenant() tenantId: string, @Query('status') status?: string) {
    return this.service.findAll(tenantId, status);
  }

  @Get(':id')
  @Permissions('logistics:read')
  @ApiOperation({ summary: 'Obtener nota de entrega por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  // Sin @Permissions(): logistics:manage (admin/despachador) O logistics:track
  // + ser el repartidor asignado (empezar su propio viaje) — la verificación
  // vive en el servicio, ver DeliveryNotesService.dispatch().
  @Patch(':id/dispatch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Despachar entrega (PENDING → DISPATCHED)' })
  dispatch(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DispatchDeliveryDto,
  ) {
    return this.service.dispatch(tenantId, id, dto, user.sub, user.permissions);
  }

  @Patch(':id/deliver')
  @HttpCode(HttpStatus.OK)
  @Permissions('logistics:manage')
  @ApiOperation({ summary: 'Marcar como entregada (DISPATCHED → DELIVERED)' })
  markDelivered(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.markDelivered(tenantId, id, user.sub);
  }
}
