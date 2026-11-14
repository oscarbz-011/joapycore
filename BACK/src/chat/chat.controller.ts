import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  MessagesQueryDto,
  OpenConversationDto,
  SendMessageDto,
} from './chat.dto';
import { ChatService } from './chat.service';
import { Authenticated } from '../common/decorators/permissions.decorator';

// Sin permiso propio: cualquier usuario de la empresa habla con sus
// compañeros, y cada uno ve solo las conversaciones en las que participa.
@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('people')
  @Authenticated()
  people(@CurrentTenant() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.chat.people(tenantId, user.sub);
  }

  @Get('unread')
  @Authenticated()
  unread(@CurrentTenant() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.chat.unread(tenantId, user.sub);
  }

  @Get('conversations')
  @Authenticated()
  conversations(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chat.conversations(tenantId, user.sub);
  }

  @Post('conversations')
  @Authenticated()
  @HttpCode(200)
  open(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: OpenConversationDto,
  ) {
    return this.chat.open(tenantId, user.sub, dto);
  }

  @Get('conversations/:id/messages')
  @Authenticated()
  messages(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MessagesQueryDto,
  ) {
    return this.chat.messages(tenantId, user.sub, id, query);
  }

  @Post('conversations/:id/messages')
  @Authenticated()
  send(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.send(tenantId, user.sub, id, dto);
  }

  @Post('conversations/:id/read')
  @Authenticated()
  @HttpCode(200)
  read(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chat.markRead(tenantId, user.sub, id);
  }
}
