import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { AdvancePaymentDto } from '../dto/advance-payment.dto';
import { PayInstallmentDto } from '../dto/pay-installment.dto';
import { PayInstallmentsDto } from '../dto/pay-installments.dto';
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

  @Get('receipts/:id')
  @Permissions('finance:read')
  @ApiOperation({
    summary: 'Obtener un recibo de dinero por ID (para imprimir o reimprimir)',
  })
  findReceipt(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.loansService.findReceiptById(tenantId, id);
  }

  @Get('installments/:installmentId/receipt')
  @Permissions('finance:read')
  @ApiOperation({
    summary:
      'Obtener el recibo de dinero generado al cobrar esta cuota (para reimprimir)',
  })
  findReceiptForInstallment(
    @CurrentTenant() tenantId: string,
    @Param('installmentId') installmentId: string,
  ) {
    return this.loansService.findReceiptByInstallment(tenantId, installmentId);
  }

  @Get(':id')
  @Permissions('finance:read')
  @ApiOperation({ summary: 'Obtener préstamo por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.loansService.findOne(tenantId, id);
  }

  @Post('installments/:installmentId/pay')
  @HttpCode(HttpStatus.OK)
  @Permissions('finance:installments:pay')
  @ApiOperation({ summary: 'Registrar pago de una cuota específica' })
  payInstallment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('installmentId') installmentId: string,
    @Body() dto: PayInstallmentDto,
  ) {
    return this.loansService.payInstallment(
      tenantId,
      installmentId,
      dto,
      user.sub,
    );
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @Permissions('finance:payments:apply')
  @ApiOperation({
    summary:
      'Imputar pago flexible — distribuye el monto entre las cuotas más antiguas pendientes',
  })
  payByAmount(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: PayInstallmentDto,
  ) {
    return this.loansService.payByAmount(
      tenantId,
      id,
      {
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        paymentDate: dto.paymentDate,
        paymentReference: dto.paymentReference,
        notes: dto.notes,
      },
      user.sub,
    );
  }

  @Post(':id/pay-installments')
  @HttpCode(HttpStatus.OK)
  @Permissions('finance:payments:apply')
  @ApiOperation({
    summary:
      'Cobrar una selección específica de cuotas — genera un solo recibo',
  })
  payInstallments(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: PayInstallmentsDto,
  ) {
    return this.loansService.payInstallments(tenantId, id, dto, user.sub);
  }

  @Post(':id/advance-payment')
  @HttpCode(HttpStatus.OK)
  @Permissions('finance:advance:manage')
  @ApiOperation({
    summary:
      'Pago adelantado — REDUCE_INSTALLMENTS cancela cuotas finales; REDUCE_AMOUNT recalcula montos',
  })
  advancePayment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AdvancePaymentDto,
  ) {
    return this.loansService.advancePayment(tenantId, id, dto, user.sub);
  }
}
