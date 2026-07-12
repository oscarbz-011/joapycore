import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { ProductsService } from '../services/products.service';
import { CreateGlobalStockMovementDto } from '../dto/create-stock-movement.dto';
import { FilterStockMovementDto } from '../dto/filter-stock-movement.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@RequiredModule('inventory')
@Controller('inventory/movements')
export class MovementsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'Listar movimientos de stock' })
  findAll(@CurrentTenant() tenantId: string, @Query() filters: FilterStockMovementDto) {
    return this.productsService.listMovements(tenantId, filters);
  }

  @Post()
  @Permissions('inventory:create')
  @ApiOperation({ summary: 'Registrar movimiento de stock manual' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateGlobalStockMovementDto) {
    return this.productsService.createGlobalMovement(tenantId, dto);
  }
}
