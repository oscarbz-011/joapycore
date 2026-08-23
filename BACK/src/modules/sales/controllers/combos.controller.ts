import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { CreateComboDto } from '../dto/create-combo.dto';
import { UpdateComboDto } from '../dto/update-combo.dto';
import { CombosService } from '../services/combos.service';

@ApiTags('Sales')
@ApiBearerAuth()
@RequiredModule('sales')
@Controller('sales/combos')
export class CombosController {
  constructor(private readonly combosService: CombosService) {}

  @Get()
  @Permissions('sales:combos:read')
  @ApiOperation({ summary: 'Listar combos' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('onlyActive') onlyActive?: string,
  ) {
    return this.combosService.findAll(tenantId, onlyActive === 'true');
  }

  @Get(':id')
  @Permissions('sales:combos:read')
  @ApiOperation({ summary: 'Obtener combo por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.combosService.findOne(tenantId, id);
  }

  @Post()
  @Permissions('sales:combos:manage')
  @ApiOperation({ summary: 'Crear combo' })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateComboDto,
  ) {
    return this.combosService.create(tenantId, dto, user.sub);
  }

  @Patch(':id')
  @Permissions('sales:combos:manage')
  @ApiOperation({ summary: 'Actualizar combo' })
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateComboDto,
  ) {
    return this.combosService.update(tenantId, id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('sales:combos:manage')
  @ApiOperation({ summary: 'Eliminar combo (soft delete)' })
  remove(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.combosService.remove(tenantId, id, user.sub);
  }
}
