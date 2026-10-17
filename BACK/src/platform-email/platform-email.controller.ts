import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PlatformEmailService } from './platform-email.service';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('platform-email')
export class PlatformEmailController {
  constructor(private readonly service: PlatformEmailService) {}

  @Get('sender')
  @Permissions('integrations:read')
  @ApiOperation({
    summary:
      'Cómo salen los correos de la empresa por el remitente de la plataforma y cuántos le quedan hoy',
  })
  sender(@CurrentTenant() tenantId: string) {
    return this.service.senderFor(tenantId);
  }
}
