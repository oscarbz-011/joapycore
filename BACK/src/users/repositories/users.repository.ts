import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../prisma/types';

interface CreateUserData {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
}

const WITH_ROLES_AND_PERMISSIONS = {
  userRoles: { include: { role: { select: { id: true, name: true } } } },
  userPermissions: { include: { permission: { select: { id: true, key: true } } } },
} as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Email is globally unique across the platform (one account = one tenant for v1),
  // so login must look it up without a tenant filter.
  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.user.findFirst({
      where: { id, tenantId },
      include: WITH_ROLES_AND_PERMISSIONS,
    });
  }

  // No tenant scoping: used only during authentication flows (e.g. refresh token
  // exchange) where the tenant is derived from the user record itself.
  findByIdForAuth(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findAll(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      include: WITH_ROLES_AND_PERMISSIONS,
      orderBy: { createdAt: 'asc' },
    });
  }

  create(
    tenantId: string,
    data: CreateUserData,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.user.create({ data: { ...data, tenantId } });
  }

  async update(tenantId: string, id: string, data: Prisma.UserUpdateInput) {
    const result = await this.prisma.user.updateMany({
      where: { id, tenantId },
      data,
    });
    return result.count;
  }

  findRolesForUser(userId: string) {
    return this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    });
  }

  findPermissionsForUser(userId: string) {
    return this.prisma.userPermission.findMany({
      where: { userId },
      include: { permission: true },
    });
  }

  attachRole(
    userId: string,
    roleId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.userRole.create({ data: { userId, roleId } });
  }

  async setRoles(userId: string, roleIds: string[]) {
    await this.prisma.userRole.deleteMany({ where: { userId } });
    if (roleIds.length > 0) {
      await this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId, roleId })),
      });
    }
  }

  async setPermissions(userId: string, permissionIds: string[]) {
    await this.prisma.userPermission.deleteMany({ where: { userId } });
    if (permissionIds.length > 0) {
      await this.prisma.userPermission.createMany({
        data: permissionIds.map((permissionId) => ({ userId, permissionId })),
      });
    }
  }
}
