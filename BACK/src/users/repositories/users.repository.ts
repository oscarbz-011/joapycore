import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../prisma/tenant-context';
import { PrismaClientOrTx } from '../../prisma/types';

interface CreateUserData {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  username?: string;
  branchId?: string;
  mustChangePassword?: boolean;
  tempPasswordEncrypted?: string;
  tempPasswordExpiresAt?: Date;
}

const WITH_ROLES_AND_PERMISSIONS = {
  userRoles: { include: { role: { select: { id: true, name: true } } } },
  userPermissions: {
    include: { permission: { select: { id: true, key: true } } },
  },
} as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Email is globally unique across the platform (one account = one tenant for v1),
  // so login must look it up without a tenant filter.
  findByEmail(email: string, client: PrismaClientOrTx = this.prisma) {
    return client.user.findUnique({ where: { email } });
  }

  // El usuario es único en toda la plataforma porque el login no pide empresa:
  // se elige uno libre sin el filtro de la seguridad de filas, sin mostrar de
  // quién es el ocupado. Usa su propia conexión: la de una transacción ya
  // viene con la empresa puesta.
  async findUsernamesStartingWith(prefix: string): Promise<string[]> {
    const users = await TenantContext.runAsPlatform(() =>
      this.prisma.user.findMany({
        where: { username: { startsWith: prefix } },
        select: { username: true },
      }),
    );
    return users.flatMap((u) => (u.username ? [u.username] : []));
  }

  findByEmailInsensitive(email: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
  }

  // Used by login — accepts email OR username interchangeably.
  findByEmailOrUsername(emailOrUsername: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ email: emailOrUsername }, { username: emailOrUsername }],
      },
    });
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

  async generateUniqueUsername(
    firstName: string,
    lastName: string,
  ): Promise<string> {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '');
    const base = `${normalize(firstName)}.${normalize(lastName)}`;
    let candidate = base;
    let suffix = 2;
    // Único en toda la plataforma: se busca sin el filtro de la seguridad de filas.
    const isTaken = (username: string) =>
      TenantContext.runAsPlatform(() =>
        this.prisma.user.findUnique({ where: { username } }),
      );
    while (await isTaken(candidate)) {
      candidate = `${base}${suffix++}`;
    }
    return candidate;
  }

  async create(
    tenantId: string,
    data: CreateUserData,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const username =
      data.username ??
      (await this.generateUniqueUsername(data.firstName, data.lastName));
    return client.user.create({ data: { ...data, username, tenantId } });
  }

  async update(
    tenantId: string,
    id: string,
    data: Prisma.UserUncheckedUpdateManyInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const result = await client.user.updateMany({
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
    tenantId: string,
    userId: string,
    roleId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.userRole.create({ data: { tenantId, userId, roleId } });
  }

  async setRoles(tenantId: string, userId: string, roleIds: string[]) {
    await this.prisma.userRole.deleteMany({ where: { userId } });
    if (roleIds.length > 0) {
      await this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ tenantId, userId, roleId })),
      });
    }
  }

  async setPermissions(
    tenantId: string,
    userId: string,
    permissionIds: string[],
  ) {
    await this.prisma.userPermission.deleteMany({ where: { userId } });
    if (permissionIds.length > 0) {
      await this.prisma.userPermission.createMany({
        data: permissionIds.map((permissionId) => ({
          tenantId,
          userId,
          permissionId,
        })),
      });
    }
  }
}
