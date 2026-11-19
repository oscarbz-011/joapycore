import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/** Datos de otros módulos que RRHH lee (orden de sucursales para el código de empleado). */
@Injectable()
export class HrSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBranchIdsInOrder(tenantId: string): Promise<string[]> {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return branches.map((b) => b.id);
  }
}
