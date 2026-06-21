import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CreateBranchDto } from '../dto/create-branch.dto';
import { UpdateBranchDto } from '../dto/update-branch.dto';
import { BranchesService } from '../services/branches.service';

@ApiTags('Branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @Permissions('branches:read')
  @ApiOperation({ summary: 'Listar sucursales del tenant' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.branchesService.findAll(tenantId);
  }

  @Get(':id')
  @Permissions('branches:read')
  @ApiOperation({ summary: 'Obtener sucursal por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.branchesService.findOne(tenantId, id);
  }

  @Post()
  @Permissions('branches:manage')
  @ApiOperation({ summary: 'Crear nueva sucursal' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateBranchDto) {
    return this.branchesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('branches:manage')
  @ApiOperation({ summary: 'Actualizar sucursal (nombre, dirección, estado)' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchesService.update(tenantId, id, dto);
  }
}
