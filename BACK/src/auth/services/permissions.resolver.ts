import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '../../common/constants/permissions.constant';
import { UsersRepository } from '../../users/repositories/users.repository';

export interface ResolvedAccess {
  roles: string[];
  permissions: string[];
}

/**
 * Roles y permisos efectivos de un usuario, calculados desde la base. Lo usan
 * tanto la emisión de tokens como la validación de cada request, para que
 * ambos apliquen exactamente la misma regla.
 */
@Injectable()
export class PermissionsResolver {
  constructor(private readonly usersRepository: UsersRepository) {}

  async resolve(userId: string): Promise<ResolvedAccess> {
    const userRoles = await this.usersRepository.findRolesForUser(userId);
    const roles = userRoles.map((userRole) => userRole.role.name);

    // Owner (rol de sistema) tiene todos los permisos del catálogo: agregar
    // un permiso nuevo a la constante alcanza, sin re-sembrar la base.
    if (userRoles.some((ur) => ur.role.isSystem)) {
      return { roles, permissions: [...PERMISSIONS] };
    }

    const rolePermissions = userRoles.flatMap((userRole) =>
      userRole.role.rolePermissions.map((rp) => rp.permission.key),
    );
    const extra = await this.usersRepository.findPermissionsForUser(userId);
    return {
      roles,
      permissions: Array.from(
        new Set([...rolePermissions, ...extra.map((up) => up.permission.key)]),
      ),
    };
  }
}
