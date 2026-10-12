import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { ProductsService } from '../services/products.service';
import { CreateGlobalStockMovementDto } from '../dto/create-stock-movement.dto';
import { FilterStockMovementDto } from '../dto/filter-stock-movement.dto';
import { PageStockMovementsDto } from '../dto/page-stock-movements.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@RequiredModule('inventory')
@Controller('inventory/movements')
export class MovementsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Permissions('inventory:movements:read')
  @ApiOperation({ summary: 'Listar movimientos de stock' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() filters: FilterStockMovementDto,
  ) {
    return this.productsService.listMovements(tenantId, filters);
  }

  @Get('page')
  @Permissions('inventory:movements:read')
  @ApiOperation({
    summary: 'Historial de movimientos de a una página, con filtros y orden',
  })
  findPage(
    @CurrentTenant() tenantId: string,
    @Query() query: PageStockMovementsDto,
  ) {
    return this.productsService.pageMovements(tenantId, query);
  }

  @Post()
  @Permissions('inventory:movements:create')
  @ApiOperation({ summary: 'Registrar movimiento de stock manual' })
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateGlobalStockMovementDto,
  ) {
    return this.productsService.createGlobalMovement(tenantId, dto);
  }
}
