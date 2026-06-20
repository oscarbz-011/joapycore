import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AreasRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.area.findMany({
      where: { tenantId },
      include: { children: true },
      orderBy: { name: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.area.findFirst({ where: { id, tenantId } });
  }

  create(tenantId: string, data: { name: string; parentId?: string }) {
    return this.prisma.area.upsert({
      where: { tenantId_name: { tenantId, name: data.name } },
      create: { ...data, tenantId },
      update: { isActive: true, ...(data.parentId !== undefined ? { parentId: data.parentId } : {}) },
    });
  }

  update(tenantId: string, id: string, data: { name?: string; parentId?: string; isActive?: boolean }) {
    return this.prisma.area.updateMany({ where: { id, tenantId }, data });
  }
}
