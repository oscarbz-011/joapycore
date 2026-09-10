import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductionOrderStatus } from '@prisma/client';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { ProductionOrdersService } from '../services/production-orders.service';
import { CreateProductionOrderDto } from '../dto/create-production-order.dto';
import { CompleteProductionOrderDto } from '../dto/complete-production-order.dto';

@ApiTags('Production')
@ApiBearerAuth()
@RequiredModule('production')
@Controller('production/orders')
export class ProductionOrdersController {
  constructor(private readonly service: ProductionOrdersService) {}

  @Get()
  @Permissions('production:orders:read')
  @ApiQuery({ name: 'status', enum: ProductionOrderStatus, required: false })
  @ApiOperation({ summary: 'Listar órdenes de producción' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('status') status?: ProductionOrderStatus,
  ) {
    return this.service.findAll(tenantId, status);
  }

  @Get(':id')
  @Permissions('production:orders:read')
  @ApiOperation({ summary: 'Obtener orden de producción por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Post()
  @Permissions('production:orders:manage')
  @ApiOperation({
    summary: 'Crear orden de producción (explota la receta del producto)',
  })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProductionOrderDto,
  ) {
    return this.service.create(tenantId, user.sub, dto);
  }

  @Post(':id/start')
  @Permissions('production:orders:manage')
  @ApiOperation({ summary: 'Iniciar la producción (valida stock de materia prima)' })
  start(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.start(tenantId, id, user.sub);
  }

  @Post(':id/complete')
  @Permissions('production:orders:manage')
  @ApiOperation({
    summary: 'Completar la producción: consume la materia prima y da de alta lo fabricado',
  })
  complete(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CompleteProductionOrderDto,
  ) {
    return this.service.complete(tenantId, id, dto, user.sub);
  }

  @Post(':id/cancel')
  @Permissions('production:orders:manage')
  @ApiOperation({ summary: 'Cancelar la orden de producción' })
  cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.cancel(tenantId, id, user.sub);
  }
}
