import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { RetryFailedProcessDto } from './dto/retry-failed-process.dto';
import { FailedProcessesService } from './failed-processes.service';

@ApiTags('Processes')
@ApiBearerAuth()
@Controller('processes/failed')
export class FailedProcessesController {
  constructor(private readonly failedProcesses: FailedProcessesService) {}

  @Get()
  @Permissions('processes:read')
  @ApiOperation({ summary: 'Procesos automáticos que necesitan revisión' })
  list(@CurrentTenant() tenantId: string) {
    return this.failedProcesses.list(tenantId);
  }

  @Get('count')
  @Permissions('processes:read')
  @ApiOperation({ summary: 'Cantidad de procesos que necesitan revisión' })
  count(@CurrentTenant() tenantId: string) {
    return this.failedProcesses.count(tenantId);
  }

  @Post(':eventId/retry')
  @HttpCode(200)
  @Permissions('processes:retry')
  @ApiOperation({ summary: 'Reintentar un proceso que falló' })
  retry(
    @CurrentTenant() tenantId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: RetryFailedProcessDto,
  ) {
    return this.failedProcesses.retry(tenantId, eventId, dto.consumer ?? null);
  }
}
