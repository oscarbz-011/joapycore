import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { CreateSaleOrderDto } from '../dto/create-sale-order.dto';
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
  findAll(@CurrentTenant() tenantId: string) {
    return this.saleOrdersService.findAll(tenantId);
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
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateSaleOrderDto) {
    return this.saleOrdersService.create(tenantId, dto);
  }

  @Post(':id/confirm')
  @Permissions('sales:update')
  @ApiOperation({
    summary: 'Confirmar orden de venta (ajusta stock y genera factura)',
  })
  confirm(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.saleOrdersService.confirm(tenantId, id);
  }

  @Post(':id/cancel')
  @Permissions('sales:cancel')
  @ApiOperation({ summary: 'Cancelar orden de venta' })
  cancel(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.saleOrdersService.cancel(tenantId, id);
  }
}
