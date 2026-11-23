import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

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

  /** Incluye las dadas de baja: los datos iniciales no las vuelven a crear. */
  allNames(tenantId: string, client: PrismaClientOrTx = this.prisma) {
    return client.documentCategory
      .findMany({ where: { tenantId }, select: { name: true } })
      .then((rows) => rows.map((row) => row.name));
  }

  createNames(
    tenantId: string,
    names: readonly string[],
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.documentCategory.createMany({
      data: names.map((name) => ({ tenantId, name })),
      skipDuplicates: true,
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
