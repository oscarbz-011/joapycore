import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import {
  CreateLeaveDto,
  FilterLeavesDto,
  LeaveBalanceQueryDto,
  RejectLeaveDto,
  UpsertLeaveBalanceDto,
} from '../dto/create-leave.dto';
import { LeavesService } from '../services/leaves.service';

@ApiTags('HR')
@ApiBearerAuth()
@RequiredModule('hr')
@Controller('hr')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  @Get('leaves')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'Listar licencias y vacaciones' })
  list(@CurrentTenant() tenantId: string, @Query() filters: FilterLeavesDto) {
    return this.leavesService.list(tenantId, filters);
  }

  @Post('leaves')
  @Permissions('hr:leaves:manage')
  @ApiOperation({ summary: 'Registrar una solicitud de licencia' })
  request(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateLeaveDto,
  ) {
    return this.leavesService.request(tenantId, dto, user.sub);
  }

  @Patch('leaves/:id/approve')
  @Permissions('hr:leaves:manage')
  @ApiOperation({ summary: 'Aprobar una licencia pendiente' })
  approve(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.leavesService.approve(tenantId, id, user.sub);
  }

  @Patch('leaves/:id/reject')
  @Permissions('hr:leaves:manage')
  @ApiOperation({ summary: 'Rechazar una licencia pendiente' })
  reject(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RejectLeaveDto,
  ) {
    return this.leavesService.reject(tenantId, id, dto.reason, user.sub);
  }

  @Patch('leaves/:id/cancel')
  @Permissions('hr:leaves:manage')
  @ApiOperation({ summary: 'Cancelar una licencia pendiente o aprobada' })
  cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.leavesService.cancel(tenantId, id, user.sub);
  }

  @Get('employees/:id/leave-balance')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'Saldo de vacaciones del empleado para un año' })
  getBalance(
    @CurrentTenant() tenantId: string,
    @Param('id') employeeId: string,
    @Query() query: LeaveBalanceQueryDto,
  ) {
    return this.leavesService.getBalance(tenantId, employeeId, query.year);
  }

  @Put('employees/:id/leave-balance')
  @Permissions('hr:leaves:manage')
  @ApiOperation({ summary: 'Ajustar los días de vacaciones de un año' })
  setBalance(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') employeeId: string,
    @Body() dto: UpsertLeaveBalanceDto,
  ) {
    return this.leavesService.setEntitlement(
      tenantId,
      employeeId,
      dto,
      user.sub,
    );
  }
}
