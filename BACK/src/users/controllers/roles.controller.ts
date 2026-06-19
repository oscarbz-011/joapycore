import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AssignPermissionsDto } from '../dto/assign-permissions.dto';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { RolesService } from '../services/roles.service';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('roles:manage')
  @ApiOperation({ summary: 'List roles in the current tenant' })
  list(@CurrentTenant() tenantId: string) {
    return this.rolesService.list(tenantId);
  }

  @Get(':id')
  @Permissions('roles:manage')
  @ApiOperation({ summary: 'Get a role by id' })
  getById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.rolesService.getById(tenantId, id);
  }

  @Post()
  @Permissions('roles:manage')
  @ApiOperation({ summary: 'Create a custom role' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('roles:manage')
  @ApiOperation({ summary: 'Rename a role' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Permissions('roles:manage')
  @ApiOperation({ summary: 'Delete a custom role' })
  delete(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.rolesService.delete(tenantId, id);
  }

  @Post(':id/permissions')
  @Permissions('roles:manage')
  @ApiOperation({ summary: 'Replace the permission set of a role' })
  assignPermissions(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    return this.rolesService.assignPermissions(tenantId, id, dto);
  }

  @Get('meta/permissions')
  @Permissions('roles:manage')
  @ApiOperation({ summary: 'List all available permission keys' })
  listPermissions() {
    return this.rolesService.listAllPermissions();
  }
}
