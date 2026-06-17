import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../prisma/types';

@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    tenantId: string,
    name: string,
    isSystem = false,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.role.create({ data: { tenantId, name, isSystem } });
  }

  findAllForTenant(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      include: { rolePermissions: { include: { permission: true } } },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.role.findFirst({
      where: { id, tenantId },
      include: { rolePermissions: { include: { permission: true } } },
    });
  }

  findManyByIds(tenantId: string, ids: string[]) {
    return this.prisma.role.findMany({ where: { id: { in: ids }, tenantId } });
  }

  findByTenantAndName(tenantId: string, name: string) {
    return this.prisma.role.findUnique({
      where: { tenantId_name: { tenantId, name } },
    });
  }

  async update(tenantId: string, id: string, data: Prisma.RoleUpdateInput) {
    const result = await this.prisma.role.updateMany({
      where: { id, tenantId },
      data,
    });
    return result.count;
  }

  async delete(tenantId: string, id: string) {
    const result = await this.prisma.role.deleteMany({
      where: { id, tenantId },
    });
    return result.count;
  }

  attachPermissions(
    roleId: string,
    permissionIds: string[],
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
  }

  async replacePermissions(roleId: string, permissionIds: string[]) {
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      });
    }
  }

  findAllPermissions() {
    return this.prisma.permission.findMany();
  }

  findPermissionsByKeys(keys: string[]) {
    return this.prisma.permission.findMany({ where: { key: { in: keys } } });
  }
}
