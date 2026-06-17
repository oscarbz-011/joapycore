import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RolesRepository } from '../repositories/roles.repository';
import { AssignPermissionsDto } from '../dto/assign-permissions.dto';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly rolesRepository: RolesRepository) {}

  list(tenantId: string) {
    return this.rolesRepository.findAllForTenant(tenantId);
  }

  async getById(tenantId: string, id: string) {
    const role = await this.rolesRepository.findById(tenantId, id);
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  async create(tenantId: string, dto: CreateRoleDto) {
    const existing = await this.rolesRepository.findByTenantAndName(
      tenantId,
      dto.name,
    );
    if (existing) {
      throw new ConflictException('A role with this name already exists');
    }
    return this.rolesRepository.create(tenantId, dto.name);
  }

  async update(tenantId: string, id: string, dto: UpdateRoleDto) {
    const role = await this.getById(tenantId, id);
    if (role.isSystem) {
      throw new ForbiddenException('Cannot modify a system role');
    }
    const count = await this.rolesRepository.update(tenantId, id, dto);
    if (count === 0) {
      throw new NotFoundException('Role not found');
    }
    return this.getById(tenantId, id);
  }

  async delete(tenantId: string, id: string) {
    const role = await this.getById(tenantId, id);
    if (role.isSystem) {
      throw new ForbiddenException('Cannot delete a system role');
    }
    await this.rolesRepository.delete(tenantId, id);
  }

  async assignPermissions(
    tenantId: string,
    id: string,
    dto: AssignPermissionsDto,
  ) {
    const role = await this.getById(tenantId, id);
    if (role.isSystem) {
      throw new ForbiddenException('Cannot modify a system role');
    }

    const permissions = await this.rolesRepository.findPermissionsByKeys(
      dto.permissions,
    );
    if (permissions.length !== dto.permissions.length) {
      throw new BadRequestException('One or more permission keys are invalid');
    }

    await this.rolesRepository.replacePermissions(
      id,
      permissions.map((p) => p.id),
    );
    return this.getById(tenantId, id);
  }
}
