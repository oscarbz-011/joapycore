import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { ProductsService } from '../services/products.service';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { FilterProductDto } from '../dto/filter-product.dto';
import { AddProductUnitsDto } from '../dto/add-product-units.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@RequiredModule('inventory')
@Controller('inventory/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'Listar productos' })
  findAll(@CurrentTenant() tenantId: string, @Query() filters: FilterProductDto) {
    return this.productsService.findAll(tenantId, filters);
  }

  @Get(':id')
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'Obtener producto con stock' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.productsService.findOneWithStock(tenantId, id);
  }

  @Post()
  @Permissions('inventory:create')
  @ApiOperation({ summary: 'Crear producto' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateProductDto) {
    return this.productsService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('inventory:update')
  @ApiOperation({ summary: 'Actualizar producto' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Permissions('inventory:delete')
  @ApiOperation({ summary: 'Eliminar producto (soft delete)' })
  delete(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.productsService.delete(tenantId, id);
  }

  @Get(':id/units')
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'Listar unidades serializadas del producto' })
  findUnits(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.productsService.findUnits(tenantId, id);
  }

  @Post(':id/units')
  @Permissions('inventory:create')
  @ApiOperation({ summary: 'Ingresar unidades serializadas manualmente' })
  addUnits(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AddProductUnitsDto,
  ) {
    return this.productsService.addUnits(tenantId, id, dto);
  }
}
