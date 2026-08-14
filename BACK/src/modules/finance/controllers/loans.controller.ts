import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AdvancePaymentDto } from '../dto/advance-payment.dto';
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
  @ApiOperation({ summary: 'Registrar pago de una cuota específica' })
  payInstallment(
    @CurrentTenant() tenantId: string,
    @Param('installmentId') installmentId: string,
    @Body() dto: PayInstallmentDto,
  ) {
    return this.loansService.payInstallment(tenantId, installmentId, dto);
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @Permissions('finance:manage')
  @ApiOperation({
    summary: 'Imputar pago flexible — distribuye el monto entre las cuotas más antiguas pendientes',
  })
  payByAmount(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: PayInstallmentDto,
  ) {
    return this.loansService.payByAmount(tenantId, id, {
      amount: dto.amount,
      paymentMethod: dto.paymentMethod as string,
      paymentDate: dto.paymentDate,
      notes: dto.notes,
    });
  }

  @Post(':id/advance-payment')
  @HttpCode(HttpStatus.OK)
  @Permissions('finance:manage')
  @ApiOperation({
    summary:
      'Pago adelantado — REDUCE_INSTALLMENTS cancela cuotas finales; REDUCE_AMOUNT recalcula montos',
  })
  advancePayment(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AdvancePaymentDto,
  ) {
    return this.loansService.advancePayment(tenantId, id, dto);
  }
}
