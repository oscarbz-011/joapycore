import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { RegisterPaymentDto } from '../dto/register-payment.dto';
import { PaymentsService } from '../services/payments.service';

@ApiTags('Payments')
@ApiBearerAuth()
@RequiredModule('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('accounts-receivable')
  @Permissions('payments:read')
  @ApiOperation({ summary: 'Listar cuentas por cobrar del tenant' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.paymentsService.findAll(tenantId);
  }

  @Get('accounts-receivable/:id')
  @Permissions('payments:read')
  @ApiOperation({ summary: 'Obtener cuenta por cobrar por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.paymentsService.findOne(tenantId, id);
  }

  @Post('accounts-receivable/:id/payments')
  @Permissions('payments:register')
  @ApiOperation({ summary: 'Registrar un pago sobre una cuenta por cobrar' })
  registerPayment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RegisterPaymentDto,
  ) {
    return this.paymentsService.registerPayment(tenantId, id, dto, user.sub);
  }
}
