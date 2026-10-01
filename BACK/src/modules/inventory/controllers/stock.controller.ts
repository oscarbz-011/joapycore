import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { FilterStockDto } from '../dto/filter-stock.dto';
import { StockService } from '../services/stock.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@RequiredModule('inventory')
@Controller('inventory/stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  @Permissions('inventory:products:read')
  @ApiOperation({ summary: 'Consultar stock físico total y por depósito' })
  findAll(@CurrentTenant() tenantId: string, @Query() filters: FilterStockDto) {
    return this.stockService.findAll(tenantId, filters);
  }
}
