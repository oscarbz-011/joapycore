import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AssignUserRolesDto } from '../dto/assign-user-roles.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UsersService } from '../services/users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('users:read')
  @ApiOperation({ summary: 'List users in the current tenant' })
  list(@CurrentTenant() tenantId: string) {
    return this.usersService.list(tenantId);
  }

  @Get(':id')
  @Permissions('users:read')
  @ApiOperation({ summary: 'Get a user by id' })
  getById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.usersService.getById(tenantId, id);
  }

  @Post()
  @Permissions('users:create')
  @ApiOperation({ summary: 'Create a teammate user in the current tenant' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateUserDto) {
    return this.usersService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('users:update')
  @ApiOperation({ summary: 'Update a user' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(tenantId, id, dto);
  }

  @Patch(':id/deactivate')
  @Permissions('users:deactivate')
  @ApiOperation({ summary: 'Deactivate a user' })
  deactivate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.usersService.deactivate(tenantId, id);
  }

  @Patch(':id/roles')
  @Permissions('users:update')
  @ApiOperation({ summary: 'Assign roles to a user' })
  assignRoles(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignUserRolesDto,
  ) {
    return this.usersService.assignRoles(tenantId, id, dto);
  }
}
