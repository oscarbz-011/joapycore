import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PosSessionStatus } from '@prisma/client';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { ClosePosSessionDto } from '../dto/close-pos-session.dto';
import { OpenPosSessionDto } from '../dto/open-pos-session.dto';
import { PosSessionsService } from '../services/pos-sessions.service';

@ApiTags('POS')
@ApiBearerAuth()
@RequiredModule('pos')
@Controller('pos/sessions')
export class PosSessionsController {
  constructor(private readonly posSessionsService: PosSessionsService) {}

  @Get('active')
  @Permissions('pos:sell')
  @ApiOperation({
    summary: 'Obtener la sesión de caja abierta del usuario actual (o null)',
  })
  getActive(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.posSessionsService.getActive(tenantId, user.sub);
  }

  @Get()
  @Permissions('pos:session:manage')
  @ApiOperation({ summary: 'Listar sesiones de caja (histórico)' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('terminalId') terminalId?: string,
    @Query('status') status?: PosSessionStatus,
  ) {
    return this.posSessionsService.findAll(tenantId, { terminalId, status });
  }

  @Post()
  @Permissions('pos:session:open')
  @ApiOperation({ summary: 'Abrir sesión de caja' })
  open(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: OpenPosSessionDto,
  ) {
    return this.posSessionsService.open(tenantId, dto, user.sub);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @Permissions('pos:session:close')
  @ApiOperation({
    summary: 'Cerrar sesión de caja (calcula diferencia de efectivo)',
  })
  close(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ClosePosSessionDto,
  ) {
    return this.posSessionsService.close(tenantId, id, dto, user.sub);
  }
}
