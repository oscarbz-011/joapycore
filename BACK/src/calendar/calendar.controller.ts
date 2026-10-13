import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
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
import { Public } from '../common/decorators/public.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  CalendarEventDto,
  CalendarRangeDto,
  UpdateCalendarEventDto,
} from './calendar.dto';
import { CalendarService } from './calendar.service';

// Sin permiso propio: cada usuario ve sus eventos y los de toda la empresa.
@ApiTags('Calendar')
@ApiBearerAuth()
@Controller('calendar')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('events')
  list(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Query() range: CalendarRangeDto,
  ) {
    return this.calendar.list(tenantId, user.sub, range);
  }

  @Post('events')
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CalendarEventDto,
  ) {
    return this.calendar.create(tenantId, user.sub, dto);
  }

  @Get('events/:id')
  find(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.calendar.find(tenantId, user.sub, id);
  }

  @Patch('events/:id')
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendar.update(tenantId, user.sub, id, dto);
  }

  @Delete('events/:id')
  remove(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.calendar.remove(tenantId, user.sub, id);
  }

  @Get('feed')
  feed(@CurrentTenant() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.calendar.feed(tenantId, user.sub);
  }

  @Post('feed/reset')
  @HttpCode(200)
  resetFeed(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.calendar.resetFeed(tenantId, user.sub);
  }

  // Lo lee otro calendario (Google, Outlook, Apple), que no inicia sesión:
  // la dirección secreta es la credencial.
  @Public()
  @Get('feeds/:token')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'private, max-age=300')
  ics(@Param('token') token: string) {
    return this.calendar.ics(token.replace(/\.ics$/, ''));
  }
}
