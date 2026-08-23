import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class DocumentCategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.documentCategory.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.documentCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  findByName(tenantId: string, name: string) {
    return this.prisma.documentCategory.findFirst({
      where: { tenantId, name, deletedAt: null },
    });
  }

  create(tenantId: string, name: string) {
    return this.prisma.documentCategory.create({ data: { tenantId, name } });
  }

  update(tenantId: string, id: string, name: string) {
    return this.prisma.documentCategory.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { name },
    });
  }

  softDelete(tenantId: string, id: string) {
    return this.prisma.documentCategory.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
