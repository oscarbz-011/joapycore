import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { CreatePosTerminalDto } from '../dto/create-pos-terminal.dto';
import { UpdatePosTerminalDto } from '../dto/update-pos-terminal.dto';
import { PosTerminalsService } from '../services/pos-terminals.service';

@ApiTags('POS')
@ApiBearerAuth()
@RequiredModule('pos')
@Controller('pos/terminals')
export class PosTerminalsController {
  constructor(private readonly posTerminalsService: PosTerminalsService) {}

  @Get()
  @Permissions('pos:sell')
  @ApiOperation({
    summary: 'Listar cajas registradoras (para elegir al abrir sesión)',
  })
  findAll(@CurrentTenant() tenantId: string) {
    return this.posTerminalsService.findAll(tenantId);
  }

  @Post()
  @Permissions('pos:terminals:manage')
  @ApiOperation({ summary: 'Crear caja registradora' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreatePosTerminalDto) {
    return this.posTerminalsService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('pos:terminals:manage')
  @ApiOperation({ summary: 'Actualizar caja registradora' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePosTerminalDto,
  ) {
    return this.posTerminalsService.update(tenantId, id, dto);
  }
}
