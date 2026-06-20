import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class PositionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.position.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.position.findFirst({ where: { id, tenantId } });
  }

  create(tenantId: string, data: { name: string }) {
    return this.prisma.position.upsert({
      where: { tenantId_name: { tenantId, name: data.name } },
      create: { ...data, tenantId },
      update: { isActive: true },
    });
  }

  update(
    tenantId: string,
    id: string,
    data: { name?: string; isActive?: boolean },
  ) {
    return this.prisma.position.updateMany({ where: { id, tenantId }, data });
  }
}
