import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { UpdateIncomingEmailIntegrationDto } from './dto/update-incoming-email-integration.dto';
import { UpdateEmailIntegrationDto } from './dto/update-email-integration.dto';
import { IntegrationsService } from './integrations.service';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get('email')
  @Permissions('integrations:read')
  @ApiOperation({
    summary: 'Obtener la configuración SMTP del tenant, sin secretos',
  })
  getEmail(@CurrentTenant() tenantId: string) {
    return this.service.getEmailIntegration(tenantId);
  }

  @Put('email')
  @Permissions('integrations:manage')
  @ApiOperation({ summary: 'Guardar y activar/desactivar la integración SMTP' })
  updateEmail(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateEmailIntegrationDto,
  ) {
    return this.service.updateEmailIntegration(tenantId, dto);
  }

  @Put('email/incoming')
  @Permissions('integrations:manage')
  @ApiOperation({ summary: 'Guardar y activar/desactivar la integración IMAP' })
  updateIncomingEmail(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateIncomingEmailIntegrationDto,
  ) {
    return this.service.updateIncomingEmailIntegration(tenantId, dto);
  }

  @Post('email/test')
  @Permissions('integrations:manage')
  @ApiOperation({ summary: 'Probar la conexión SMTP guardada' })
  testEmail(@CurrentTenant() tenantId: string) {
    return this.service.testEmailIntegration(tenantId);
  }

  @Post('email/incoming/test')
  @Permissions('integrations:manage')
  @ApiOperation({ summary: 'Probar la conexión IMAP guardada' })
  testIncomingEmail(@CurrentTenant() tenantId: string) {
    return this.service.testIncomingEmailIntegration(tenantId);
  }
}
