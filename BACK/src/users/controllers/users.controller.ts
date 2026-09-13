import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { AssignPermissionsDto } from '../dto/assign-permissions.dto';
import { AssignUserRolesDto } from '../dto/assign-user-roles.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UsersService } from '../services/users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── Self-service (all authenticated users) ─────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get own profile' })
  getMe(@CurrentUser() user: JwtPayload, @CurrentTenant() tenantId: string) {
    return this.usersService.getById(tenantId, user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update own profile (firstName, lastName)' })
  updateMe(
    @CurrentUser() user: JwtPayload,
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(tenantId, user.sub, dto);
  }

  @Post('me/change-password')
  @ApiOperation({ summary: 'Change own password' })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.sub, dto);
  }

  // ── Admin operations ────────────────────────────────────────────────────────

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
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(tenantId, dto, user.sub);
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
  deactivate(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.usersService.deactivate(tenantId, id, user.sub);
  }

  @Patch(':id/reactivate')
  @Permissions('users:deactivate')
  @ApiOperation({ summary: 'Reactivate a user' })
  reactivate(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.usersService.reactivate(tenantId, id, user.sub);
  }

  @Post(':id/reset-password')
  @Permissions('users:update')
  @ApiOperation({
    summary: 'Generate a new temporary password for a user (admin)',
  })
  resetPassword(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.usersService.resetPassword(tenantId, id, user.sub);
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

  @Put(':id/permissions')
  @Permissions('roles:manage')
  @ApiOperation({
    summary: 'Set extra permissions for a user (on top of their roles)',
  })
  setExtraPermissions(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    return this.usersService.setExtraPermissions(tenantId, id, dto.permissions);
  }
}
