import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { ProductsService } from '../services/products.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@RequiredModule('inventory')
@Controller('inventory/batches')
export class BatchesController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Permissions('inventory:products:read')
  @ApiOperation({ summary: 'Listar lotes de todos los productos' })
  @ApiQuery({ name: 'productId', required: false })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('productId') productId?: string,
  ) {
    return this.productsService.listAllBatches(tenantId, { productId });
  }
}
