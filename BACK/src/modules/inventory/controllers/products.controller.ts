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
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { ProductsService } from '../services/products.service';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { FilterProductDto } from '../dto/filter-product.dto';
import { AddProductUnitsDto } from '../dto/add-product-units.dto';
import { CreateStockMovementDto } from '../dto/create-stock-movement.dto';
import { CreateProductSupplierDto } from '../dto/create-product-supplier.dto';
import { UpdateProductSupplierDto } from '../dto/update-product-supplier.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@RequiredModule('inventory')
@Controller('inventory/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Permissions('inventory:products:read')
  @ApiOperation({ summary: 'Listar productos' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() filters: FilterProductDto,
  ) {
    return this.productsService.findAll(tenantId, filters);
  }

  @Get('with-stock')
  @Permissions('inventory:products:read')
  @ApiOperation({ summary: 'Listar productos con stock actual' })
  findAllWithStock(
    @CurrentTenant() tenantId: string,
    @Query() filters: FilterProductDto,
  ) {
    return this.productsService.findAllWithStock(tenantId, filters);
  }

  @Get(':id')
  @Permissions('inventory:products:read')
  @ApiOperation({ summary: 'Obtener producto con stock' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.productsService.findOneWithStock(tenantId, id);
  }

  @Post()
  @Permissions('inventory:products:create')
  @ApiOperation({ summary: 'Crear producto' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateProductDto) {
    return this.productsService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('inventory:products:update')
  @ApiOperation({ summary: 'Actualizar producto' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Permissions('inventory:products:delete')
  @ApiOperation({ summary: 'Eliminar producto (soft delete)' })
  delete(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.productsService.delete(tenantId, id);
  }

  @Post(':id/stock-movements')
  @Permissions('inventory:movements:create')
  @ApiOperation({
    summary: 'Registrar movimiento de stock manual (IN / ADJUSTMENT)',
  })
  addStockMovement(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateStockMovementDto,
  ) {
    return this.productsService.addStockMovement(tenantId, id, dto);
  }

  @Get(':id/units')
  @Permissions('inventory:products:read')
  @ApiOperation({ summary: 'Listar unidades serializadas del producto' })
  findUnits(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.productsService.findUnits(tenantId, id);
  }

  @Get(':id/batches')
  @Permissions('inventory:products:read')
  @ApiOperation({ summary: 'Listar lotes del producto' })
  findBatches(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.productsService.listProductBatches(tenantId, id);
  }

  @Post(':id/units')
  @Permissions('inventory:products:create')
  @ApiOperation({ summary: 'Ingresar unidades serializadas manualmente' })
  addUnits(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AddProductUnitsDto,
  ) {
    return this.productsService.addUnits(tenantId, id, dto);
  }

  // ── Suppliers ────────────────────────────────────────────────────────────────

  @Get(':id/suppliers')
  @Permissions('inventory:products:read')
  @ApiOperation({ summary: 'Listar proveedores asociados al producto' })
  getProductSuppliers(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.productsService.getProductSuppliers(tenantId, id);
  }

  @Post(':id/suppliers')
  @Permissions('inventory:products:update')
  @ApiOperation({ summary: 'Asociar proveedor al producto' })
  addProductSupplier(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateProductSupplierDto,
  ) {
    return this.productsService.addProductSupplier(tenantId, id, dto);
  }

  @Patch(':id/suppliers/:supplierId')
  @Permissions('inventory:products:update')
  @ApiOperation({ summary: 'Actualizar asociación proveedor-producto' })
  updateProductSupplier(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('supplierId') supplierId: string,
    @Body() dto: UpdateProductSupplierDto,
  ) {
    return this.productsService.updateProductSupplier(
      tenantId,
      id,
      supplierId,
      dto,
    );
  }

  @Delete(':id/suppliers/:supplierId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('inventory:products:delete')
  @ApiOperation({ summary: 'Desasociar proveedor del producto' })
  removeProductSupplier(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('supplierId') supplierId: string,
  ) {
    return this.productsService.removeProductSupplier(tenantId, id, supplierId);
  }
}
