import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { RegisterSupplierPaymentDto } from '../dto/register-supplier-payment.dto';
import { PayablesService } from '../services/payables.service';

@ApiTags('Procurement')
@ApiBearerAuth()
@RequiredModule('procurement')
@Controller('procurement/payables')
export class PayablesController {
  constructor(private readonly payablesService: PayablesService) {}

  @Get()
  @Permissions('procurement:payables:read')
  @ApiOperation({ summary: 'Listar cuentas por pagar del tenant' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.payablesService.findAll(tenantId);
  }

  @Get(':id')
  @Permissions('procurement:payables:read')
  @ApiOperation({ summary: 'Obtener cuenta por pagar por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.payablesService.findOne(tenantId, id);
  }

  @Post(':id/payments')
  @Permissions('procurement:payables:register')
  @ApiOperation({ summary: 'Registrar un pago sobre una cuenta por pagar' })
  registerPayment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RegisterSupplierPaymentDto,
  ) {
    return this.payablesService.registerPayment(tenantId, id, dto, user.sub);
  }
}
