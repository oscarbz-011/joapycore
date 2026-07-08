import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const WITH_RELATIONS = {
  include: {
    area: { select: { id: true, name: true } },
    role: { select: { id: true, name: true } },
  },
} as const;

@Injectable()
export class PositionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.position.findMany({
      where: { tenantId },
      orderBy: [{ area: { name: 'asc' } }, { name: 'asc' }],
      ...WITH_RELATIONS,
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.position.findFirst({
      where: { id, tenantId },
      ...WITH_RELATIONS,
    });
  }

  create(
    tenantId: string,
    data: { name: string; areaId?: string; roleId?: string },
  ) {
    return this.prisma.position.upsert({
      where: { tenantId_name: { tenantId, name: data.name } },
      create: { tenantId, ...data },
      update: {
        isActive: true,
        areaId: data.areaId ?? null,
        roleId: data.roleId ?? null,
      },
      ...WITH_RELATIONS,
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      isActive?: boolean;
      areaId?: string | null;
      roleId?: string | null;
    },
  ) {
    await this.prisma.position.updateMany({ where: { id, tenantId }, data });
    return this.findById(tenantId, id);
  }
}
