import { Injectable } from '@nestjs/common';
import { Industry } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

const DEFAULT_CATEGORIES: Record<Industry, string[]> = {
  electrodomesticos: [
    'Heladeras y Freezers',
    'Lavarropas y Secarropas',
    'Televisores y Monitores',
    'Cocinas y Hornos',
    'Aire Acondicionado y Calefacción',
    'Audio y Home Theater',
    'Pequeños Electrodomésticos',
    'Accesorios y Cables',
  ],
};

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  seedDefaults(tenantId: string, industry: Industry, client: PrismaClientOrTx = this.prisma) {
    const names = DEFAULT_CATEGORIES[industry] ?? [];
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

  update(tenantId: string, id: string, data: { name?: string; isActive?: boolean }) {
    return this.prisma.category.updateMany({ where: { tenantId, id }, data });
  }
}
