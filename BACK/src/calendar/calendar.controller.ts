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
}
