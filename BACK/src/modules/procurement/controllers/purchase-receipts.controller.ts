import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { PurchaseReceiptsService } from '../services/purchase-receipts.service';
import { CreatePurchaseReceiptDto } from '../dto/create-purchase-receipt.dto';

@ApiTags('Procurement')
@ApiBearerAuth()
@RequiredModule('procurement')
@Controller('procurement')
export class PurchaseReceiptsController {
  constructor(
    private readonly purchaseReceiptsService: PurchaseReceiptsService,
  ) {}

  @Post('purchase-orders/:id/receipts')
  @Permissions('procurement:receive')
  @ApiOperation({
    summary: 'Registrar una recepción de mercadería sobre una orden de compra',
  })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreatePurchaseReceiptDto,
  ) {
    return this.purchaseReceiptsService.create(tenantId, id, dto, user.sub);
  }

  @Get('purchase-orders/:id/receipts')
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'Listar recepciones de una orden de compra' })
  findByOrder(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.purchaseReceiptsService.findByOrder(tenantId, id);
  }

  @Get('purchase-receipts/:id')
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'Obtener una recepción por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.purchaseReceiptsService.findOne(tenantId, id);
  }
}
