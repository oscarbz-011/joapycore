import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  CommunicationIdentityDto,
  CommunicationMessagesQueryDto,
  CommunicationNoteDto,
  CommunicationPageDto,
  CommunicationSettingsDto,
  CommunicationTemplateDto,
  UpdateCommunicationIdentityDto,
} from './hub.dto';
import { CommunicationHubService } from './hub.service';

@ApiTags('Communications')
@ApiBearerAuth()
@Controller('communications')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CommunicationHubController {
  constructor(private readonly hub: CommunicationHubService) {}

  @Get('settings')
  @Permissions('communications:access')
  settings(@CurrentTenant() tenantId: string) {
    return this.hub.settings(tenantId);
  }

  @Patch('settings')
  @Permissions('communications:access', 'communications:settings:manage')
  updateSettings(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CommunicationSettingsDto,
  ) {
    return this.hub.updateSettings(tenantId, user.sub, dto);
  }

  @Get('identities')
  @Permissions('communications:access', 'communications:settings:manage')
  identities(@CurrentTenant() tenantId: string) {
    return this.hub.identities(tenantId);
  }

  @Post('identities')
  @Permissions('communications:access', 'communications:settings:manage')
  createIdentity(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CommunicationIdentityDto,
  ) {
    return this.hub.createIdentity(tenantId, user.sub, dto);
  }

  @Patch('identities/:id')
  @Permissions('communications:access', 'communications:settings:manage')
  updateIdentity(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommunicationIdentityDto,
  ) {
    return this.hub.updateIdentity(tenantId, user.sub, id, dto);
  }

  @Delete('identities/:id')
  @Permissions('communications:access', 'communications:settings:manage')
  deleteIdentity(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.hub.deleteIdentity(tenantId, user.sub, id);
  }

  @Get('templates')
  @Permissions('communications:access', 'communications:settings:manage')
  templates(@CurrentTenant() tenantId: string) {
    return this.hub.templates(tenantId);
  }

  @Post('templates/versions')
  @Permissions('communications:access', 'communications:settings:manage')
  createTemplate(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CommunicationTemplateDto,
  ) {
    return this.hub.createTemplateVersion(tenantId, user.sub, dto);
  }

  @Post('templates/preview')
  @Permissions('communications:access', 'communications:settings:manage')
  previewTemplate(@Body() dto: CommunicationTemplateDto) {
    return this.hub.previewTemplate(dto);
  }

  @Get('messages')
  @RequiredModule('billing')
  @Permissions(
    'communications:access',
    'communications:delivery:read',
    'billing:read',
  )
  messages(
    @CurrentTenant() tenantId: string,
    @Query() query: CommunicationMessagesQueryDto,
  ) {
    return this.hub.messages(tenantId, query);
  }

  @Get('messages/:id')
  @RequiredModule('billing')
  @Permissions(
    'communications:access',
    'communications:delivery:read',
    'billing:read',
  )
  message(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.hub.message(tenantId, id);
  }

  @Post('invoices/:id/send')
  @RequiredModule('billing')
  @Permissions(
    'communications:access',
    'communications:email:send',
    'billing:read',
  )
  sendInvoice(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.hub.sendInvoice(tenantId, user.sub, id);
  }

  @Post('messages/:id/retry')
  @RequiredModule('billing')
  @Permissions(
    'communications:access',
    'communications:email:send',
    'communications:delivery:read',
    'billing:read',
  )
  retry(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.hub.retry(tenantId, user.sub, id);
  }

  @Get('timeline/INVOICE/:id')
  @RequiredModule('billing')
  @Permissions(
    'communications:access',
    'communications:delivery:read',
    'billing:read',
  )
  timeline(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CommunicationPageDto,
  ) {
    return this.hub.timeline(tenantId, id, query);
  }

  @Post('timeline/INVOICE/:id/notes')
  @RequiredModule('billing')
  @Permissions(
    'communications:access',
    'communications:notes:create',
    'billing:read',
  )
  note(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommunicationNoteDto,
  ) {
    return this.hub.createNote(tenantId, user.sub, id, dto);
  }

  @Get('notifications')
  @Permissions('communications:access')
  notifications(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Query() query: CommunicationPageDto,
  ) {
    return this.hub.notifications(tenantId, user.sub, query);
  }

  @Post('notifications/:id/read')
  @Permissions('communications:access')
  readNotification(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.hub.readNotification(tenantId, user.sub, id);
  }
}
