import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

/**
 * Cuentas de usuario vinculadas a empleados y datos de configuración que RRHH
 * necesita (puesto → rol, orden de sucursales). Los usuarios son del núcleo;
 * este repositorio concentra lo que RRHH toca de ellos.
 */
@Injectable()
export class EmployeeAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string, client: PrismaClientOrTx = this.prisma) {
    return client.user.findUnique({ where: { email } });
  }

  async findUsernamesStartingWith(
    prefix: string,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<string[]> {
    const users = await client.user.findMany({
      where: { username: { startsWith: prefix } },
      select: { username: true },
    });
    return users.map((u) => u.username).filter(Boolean) as string[];
  }

  createUser(
    data: Prisma.UserUncheckedCreateInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.user.create({ data });
  }

  // Asigna al usuario el rol vinculado al puesto, si el puesto tiene uno.
  async assignPositionRole(
    tenantId: string,
    userId: string,
    positionId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const position = await client.position.findFirst({
      where: { id: positionId, tenantId },
      select: { roleId: true },
    });
    if (!position?.roleId) return;
    await client.userRole.create({
      data: { userId, roleId: position.roleId },
    });
  }

  updateUser(userId: string, data: Prisma.UserUncheckedUpdateInput) {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  deactivateUser(
    tenantId: string,
    userId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.user.updateMany({
      where: { id: userId, tenantId },
      data: { status: 'INACTIVE', sessionsValidAfter: new Date() },
    });
  }

  async findBranchIdsInOrder(tenantId: string): Promise<string[]> {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return branches.map((b) => b.id);
  }
}
