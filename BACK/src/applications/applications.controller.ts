import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { ApplicationEmailService } from './application-email.service';
import { SendApplicationEmailDto } from './dto/send-email.dto';

@ApiTags('Applications')
@ApiBearerAuth()
@Controller('applications/email')
export class ApplicationsController {
  constructor(private readonly emailService: ApplicationEmailService) {}

  @Get('status')
  @Permissions('applications:email:read')
  @ApiOperation({
    summary: 'Consultar si el correo del tenant está disponible',
  })
  status(@CurrentTenant() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.emailService.status(tenantId, user.email);
  }

  @Get('messages')
  @Permissions('applications:email:read')
  @ApiOperation({
    summary: 'Listar los últimos correos enviados por el tenant',
  })
  list(@CurrentTenant() tenantId: string) {
    return this.emailService.list(tenantId);
  }

  @Get('inbox')
  @Permissions('applications:email:read')
  @ApiOperation({ summary: 'Listar los correos recibidos sincronizados' })
  listInbox(@CurrentTenant() tenantId: string) {
    return this.emailService.listInbox(tenantId);
  }

  @Post('sync')
  @Permissions('applications:email:read')
  @ApiOperation({ summary: 'Sincronizar la bandeja de entrada mediante IMAP' })
  syncInbox(@CurrentTenant() tenantId: string) {
    return this.emailService.syncInbox(tenantId);
  }

  @Post('messages')
  @Permissions('applications:email:send')
  @ApiOperation({
    summary: 'Enviar un correo mediante la integración SMTP activa',
  })
  send(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendApplicationEmailDto,
  ) {
    return this.emailService.send(tenantId, user.sub, dto);
  }
}
