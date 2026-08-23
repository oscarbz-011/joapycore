import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { CreatePosSaleDto } from '../dto/create-pos-sale.dto';
import { PosSalesService } from '../services/pos-sales.service';

@ApiTags('POS')
@ApiBearerAuth()
@RequiredModule('pos')
@Controller('pos/sales')
export class PosSalesController {
  constructor(private readonly posSalesService: PosSalesService) {}

  @Post()
  @Permissions('pos:sell')
  @ApiOperation({
    summary:
      'Venta rápida de mostrador (crea, cobra, descuenta stock y factura en un solo paso)',
  })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePosSaleDto,
  ) {
    return this.posSalesService.create(tenantId, dto, user.sub);
  }

  @Get()
  @Permissions('pos:sell')
  @ApiOperation({ summary: 'Ventas de una sesión de caja' })
  listBySession(
    @CurrentTenant() tenantId: string,
    @Query('sessionId') sessionId: string,
  ) {
    return this.posSalesService.listBySession(tenantId, sessionId);
  }

  @Get('history')
  @Permissions('pos:session:manage')
  @ApiOperation({ summary: 'Histórico de ventas POS' })
  history(
    @CurrentTenant() tenantId: string,
    @Query('terminalId') terminalId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.posSalesService.listHistory(tenantId, {
      terminalId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}
