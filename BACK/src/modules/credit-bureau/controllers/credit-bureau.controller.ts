import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { RecordBureauCheckDto } from '../dto/record-bureau-check.dto';
import { UpdateCreditBureauConfigDto } from '../dto/update-credit-bureau-config.dto';
import { CreditBureauChecksService } from '../services/credit-bureau-checks.service';
import { CreditBureauConfigService } from '../services/credit-bureau-config.service';

@ApiTags('Credit Bureau')
// La consulta al buró es parte de la evaluación de crédito (Financiamiento).
@ApiBearerAuth()
@RequiredModule('finance')
@Controller('credit-bureau')
export class CreditBureauController {
  constructor(
    private readonly configService: CreditBureauConfigService,
    private readonly checksService: CreditBureauChecksService,
  ) {}

  @Get('config')
  @Permissions('sales:read')
  @ApiOperation({
    summary: 'Obtener configuración de la integración con buró de crédito',
  })
  getConfig(@CurrentTenant() tenantId: string) {
    return this.configService.getConfig(tenantId);
  }

  @Patch('config')
  @Permissions('tenants:update')
  @ApiOperation({
    summary:
      'Habilitar/deshabilitar el buró de crédito y su frecuencia de consulta',
  })
  updateConfig(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateCreditBureauConfigDto,
  ) {
    return this.configService.updateConfig(tenantId, dto);
  }

  @Post('checks')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('sales:credit:evaluate')
  @ApiOperation({
    summary:
      'Registrar manualmente el resultado de una consulta al buró de crédito',
  })
  recordCheck(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordBureauCheckDto,
  ) {
    return this.checksService.recordCheck(tenantId, dto, user.sub);
  }
}
