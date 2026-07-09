import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';
import { WarehousesService } from '../services/warehouses.service';

@ApiTags('Warehouses')
@ApiBearerAuth()
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @Permissions('warehouses:read')
  @ApiOperation({ summary: 'Listar depósitos del tenant' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.warehousesService.findAll(tenantId);
  }

  @Get(':id')
  @Permissions('warehouses:read')
  @ApiOperation({ summary: 'Obtener depósito por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.warehousesService.findOne(tenantId, id);
  }

  @Post()
  @Permissions('warehouses:manage')
  @ApiOperation({ summary: 'Crear nuevo depósito' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('warehouses:manage')
  @ApiOperation({ summary: 'Actualizar depósito (nombre, sucursal, estado)' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehousesService.update(tenantId, id, dto);
  }
}
