import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { StockEntryService } from '../services/stock-entry.service';
import { CreateInitialStockDto } from '../dto/create-initial-stock.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@RequiredModule('inventory')
@Controller('inventory/stock-entries')
export class StockEntryController {
  constructor(private readonly stockEntryService: StockEntryService) {}

  @Post('initial')
  @Permissions('inventory:movements:create')
  @ApiOperation({
    summary:
      'Carga inicial de stock — no pasa por Compras, queda documentado el origen',
  })
  createInitial(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateInitialStockDto,
  ) {
    return this.stockEntryService.registerEntry(tenantId, {
      productId: dto.productId,
      quantity: dto.quantity,
      reason: 'INITIAL',
      warehouseId: dto.warehouseId,
      branchId: dto.branchId,
      initialSourceType: dto.initialSourceType,
      batchNumber: dto.batchNumber,
      unitCost: dto.unitCost,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      serialNumbers: dto.serialNumbers,
      notes: dto.notes,
    });
  }
}
