import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { UpsertSaleTargetDto } from '../dto/upsert-sale-target.dto';
import { SaleTargetsService } from '../services/sale-targets.service';

@ApiTags('Sales')
@ApiBearerAuth()
@RequiredModule('sales')
@Controller('sales')
export class SaleTargetsController {
  constructor(private readonly saleTargetsService: SaleTargetsService) {}

  @Get('performance')
  @Permissions('sales:read')
  @ApiOperation({
    summary: 'Rendimiento de ventas por vendedor para un período',
  })
  getPerformance(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Query('period') period: string,
  ) {
    const p = period ?? this.currentPeriod();
    const canManage = user.permissions.includes('sales:manage');
    return this.saleTargetsService.getPerformance(
      tenantId,
      p,
      user.sub,
      canManage,
    );
  }

  @Put('targets/company')
  @Permissions('sales:manage')
  @ApiOperation({ summary: 'Establecer meta de ventas general de la empresa' })
  setCompanyTarget(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpsertSaleTargetDto,
  ) {
    return this.saleTargetsService.setCompanyTarget(
      tenantId,
      dto.period,
      dto.targetAmount,
    );
  }

  @Delete('targets/company')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('sales:manage')
  @ApiOperation({ summary: 'Eliminar meta de ventas general' })
  removeCompanyTarget(
    @CurrentTenant() tenantId: string,
    @Query('period') period: string,
  ) {
    return this.saleTargetsService.removeCompanyTarget(tenantId, period);
  }

  @Put('targets/sellers/:userId')
  @Permissions('sales:manage')
  @ApiOperation({ summary: 'Establecer meta de ventas para un vendedor' })
  setSellerTarget(
    @CurrentTenant() tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: UpsertSaleTargetDto,
  ) {
    return this.saleTargetsService.setSellerTarget(
      tenantId,
      userId,
      dto.period,
      dto.targetAmount,
    );
  }

  @Delete('targets/sellers/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('sales:manage')
  @ApiOperation({ summary: 'Eliminar meta de ventas de un vendedor' })
  removeSellerTarget(
    @CurrentTenant() tenantId: string,
    @Param('userId') userId: string,
    @Query('period') period: string,
  ) {
    return this.saleTargetsService.removeSellerTarget(tenantId, userId, period);
  }

  private currentPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
