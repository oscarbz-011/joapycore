import {
  Body,
  Controller,
  Get,
  Param,
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
import { ConversationsService } from './conversations.service';
import {
  CommunicationNoteDto,
  CommunicationPageDto,
  ConversationParamsDto,
  ConversationsQueryDto,
} from './hub.dto';

// Hoy todo lo que hay en una conversación son correos de facturas.
const READ = [
  'communications:access',
  'communications:delivery:read',
  'billing:read',
] as const;

@ApiTags('Communications')
@ApiBearerAuth()
@Controller('communications/conversations')
@RequiredModule('billing')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @Permissions(...READ)
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ConversationsQueryDto,
  ) {
    return this.conversations.list(tenantId, query);
  }

  @Get('summary')
  @Permissions(...READ)
  summary(@CurrentTenant() tenantId: string) {
    return this.conversations.summary(tenantId);
  }

  @Get(':contactType/:contactId')
  @Permissions(...READ)
  thread(
    @CurrentTenant() tenantId: string,
    @Param() params: ConversationParamsDto,
    @Query() query: CommunicationPageDto,
  ) {
    return this.conversations.thread(
      tenantId,
      params.contactType,
      params.contactId,
      query,
    );
  }

  @Post(':contactType/:contactId/notes')
  @Permissions(
    'communications:access',
    'communications:notes:create',
    'billing:read',
  )
  note(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param() params: ConversationParamsDto,
    @Body() dto: CommunicationNoteDto,
  ) {
    return this.conversations.createNote(
      tenantId,
      user.sub,
      params.contactType,
      params.contactId,
      dto,
    );
  }
}
