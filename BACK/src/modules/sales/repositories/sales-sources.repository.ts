import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

/**
 * Datos de otros módulos (usuarios y sucursales del núcleo, sesiones de caja
 * de POS) que Ventas lee al crear pedidos. Agrupados acá para que el servicio
 * no consulte Prisma directo.
 */
@Injectable()
export class SalesSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserBranchId(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { branchId: true },
    });
    return user?.branchId ?? null;
  }

  async findMainBranchId(tenantId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { tenantId, isMain: true },
      select: { id: true },
    });
    return branch?.id ?? null;
  }

  findOpenPosSession(
    tenantId: string,
    posSessionId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.posSession.findFirst({
      where: { id: posSessionId, tenantId, status: 'OPEN' },
    });
  }
}
