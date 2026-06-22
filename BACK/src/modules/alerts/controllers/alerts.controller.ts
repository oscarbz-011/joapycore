import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { UpsertAlertDto } from '../dto/upsert-alert.dto';
import { AlertsService } from '../services/alerts.service';

@ApiTags('Alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('configs')
  @Permissions('alerts:read')
  @ApiOperation({ summary: 'Listar configuraciones de alertas del tenant' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.alertsService.findAll(tenantId);
  }

  @Post('configs')
  @Permissions('alerts:manage')
  @ApiOperation({ summary: 'Crear o actualizar una configuración de alerta' })
  upsert(@CurrentTenant() tenantId: string, @Body() dto: UpsertAlertDto) {
    return this.alertsService.upsert(tenantId, dto);
  }
}
