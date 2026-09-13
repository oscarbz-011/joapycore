import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toUpperNorm } from '../../../common/utils/normalize.util';

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
    const name = toUpperNorm(data.name);
    return this.prisma.position.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: { tenantId, ...data, name },
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
    const normalized = data.name
      ? { ...data, name: toUpperNorm(data.name) }
      : data;
    await this.prisma.position.updateMany({
      where: { id, tenantId },
      data: normalized,
    });
    return this.findById(tenantId, id);
  }
}
