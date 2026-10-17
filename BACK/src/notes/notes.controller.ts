import {
  Body,
  Controller,
  Delete,
  Get,
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
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { NoteDto, NotesQueryDto, UpdateNoteDto } from './notes.dto';
import { NotesService } from './notes.service';

// Sin permiso propio: cada usuario maneja sus notas y nadie más las ve.
@ApiTags('Notes')
@ApiBearerAuth()
@Controller('notes')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Query() query: NotesQueryDto,
  ) {
    return this.notes.list(tenantId, user.sub, query.view);
  }

  @Post()
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: NoteDto,
  ) {
    return this.notes.create(tenantId, user.sub, dto);
  }

  @Get(':id')
  find(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notes.find(tenantId, user.sub, id);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notes.update(tenantId, user.sub, id, dto);
  }

  @Post(':id/trash')
  @HttpCode(200)
  trash(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notes.trash(tenantId, user.sub, id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notes.restore(tenantId, user.sub, id);
  }

  @Delete(':id')
  remove(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notes.remove(tenantId, user.sub, id);
  }
}
