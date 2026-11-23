import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Incluye las inactivas: los datos iniciales no las vuelven a crear. */
  allNames(tenantId: string, client: PrismaClientOrTx = this.prisma) {
    return client.category
      .findMany({ where: { tenantId }, select: { name: true } })
      .then((rows) => rows.map((row) => row.name));
  }

  createNames(
    tenantId: string,
    names: readonly string[],
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.category.createMany({
      data: names.map((name) => ({ tenantId, name })),
      skipDuplicates: true,
    });
  }

  findAll(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.category.findFirst({ where: { tenantId, id } });
  }

  create(tenantId: string, name: string) {
    return this.prisma.category.create({ data: { tenantId, name } });
  }

  update(
    tenantId: string,
    id: string,
    data: { name?: string; isActive?: boolean },
  ) {
    return this.prisma.category.updateMany({ where: { tenantId, id }, data });
  }
}
