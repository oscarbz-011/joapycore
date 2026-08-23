import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

const DEFAULT_CATEGORIES: Record<string, string[]> = {
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
  ferreteria: [
    'Herramientas Manuales',
    'Herramientas Eléctricas',
    'Materiales de Construcción',
    'Pinturas y Revestimientos',
    'Plomería',
    'Electricidad',
    'Fijaciones y Tornillería',
    'Seguridad',
  ],
  supermercado: [
    'Almacén',
    'Bebidas',
    'Lácteos y Huevos',
    'Carnes y Fiambres',
    'Frutas y Verduras',
    'Limpieza y Hogar',
    'Cuidado Personal',
    'Congelados',
  ],
  default: ['General', 'Otros'],
};

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  seedDefaults(
    tenantId: string,
    industry: string | null | undefined,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const names =
      (industry ? DEFAULT_CATEGORIES[industry] : null) ??
      DEFAULT_CATEGORIES.default;
    if (names.length === 0) return Promise.resolve();
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
