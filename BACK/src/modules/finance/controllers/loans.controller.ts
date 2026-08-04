import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PayInstallmentDto } from '../dto/pay-installment.dto';
import { LoansService } from '../services/loans.service';

@ApiTags('Finance')
@ApiBearerAuth()
@Controller('finance/loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Get()
  @Permissions('finance:read')
  @ApiOperation({ summary: 'Listar préstamos del tenant' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.loansService.findAll(tenantId);
  }

  @Get('overdue-installments')
  @Permissions('finance:read')
  @ApiOperation({ summary: 'Listar cuotas vencidas' })
  findOverdue(@CurrentTenant() tenantId: string) {
    return this.loansService.findOverdueInstallments(tenantId);
  }

  @Get('by-order/:saleOrderId')
  @Permissions('finance:read')
  @ApiOperation({ summary: 'Obtener préstamo de un pedido específico' })
  findByOrder(
    @CurrentTenant() tenantId: string,
    @Param('saleOrderId') saleOrderId: string,
  ) {
    return this.loansService.findByOrder(tenantId, saleOrderId);
  }

  @Get(':id')
  @Permissions('finance:read')
  @ApiOperation({ summary: 'Obtener préstamo por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.loansService.findOne(tenantId, id);
  }

  @Post('installments/:installmentId/pay')
  @HttpCode(HttpStatus.OK)
  @Permissions('finance:manage')
  @ApiOperation({ summary: 'Registrar pago de una cuota' })
  payInstallment(
    @CurrentTenant() tenantId: string,
    @Param('installmentId') installmentId: string,
    @Body() dto: PayInstallmentDto,
  ) {
    return this.loansService.payInstallment(tenantId, installmentId, dto);
  }
}
