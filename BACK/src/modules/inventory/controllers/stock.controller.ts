import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { AssignUnlocatedStockDto } from '../dto/assign-unlocated-stock.dto';
import { FilterStockDto } from '../dto/filter-stock.dto';
import { StockService } from '../services/stock.service';
import { UnlocatedStockService } from '../services/unlocated-stock.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@RequiredModule('inventory')
@Controller('inventory/stock')
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly unlocatedStockService: UnlocatedStockService,
  ) {}

  @Get()
  @Permissions('inventory:products:read')
  @ApiOperation({ summary: 'Consultar stock físico total y por depósito' })
  findAll(@CurrentTenant() tenantId: string, @Query() filters: FilterStockDto) {
    return this.stockService.findAll(tenantId, filters);
  }

  @Post('unlocated/assign')
  @Permissions('inventory:movements:create')
  @ApiOperation({
    summary: 'Asignar a un depósito el stock sin depósito asignado',
  })
  assignUnlocated(
    @CurrentTenant() tenantId: string,
    @Body() dto: AssignUnlocatedStockDto,
  ) {
    return this.unlocatedStockService.assign(tenantId, dto);
  }
}
