import { Injectable } from '@nestjs/common';
import { Industry } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

// Categorías sembradas al registrar el tenant, según su rubro. La clave pasó
// de texto libre al enum Industry — antes un rubro mal escrito caía en
// 'default' sin que nadie se enterara.
const DEFAULT_CATEGORIES: Record<Industry, string[]> = {
  ELECTRODOMESTICOS: [
    'Heladeras y Freezers',
    'Lavarropas y Secarropas',
    'Televisores y Monitores',
    'Cocinas y Hornos',
    'Aire Acondicionado y Calefacción',
    'Audio y Home Theater',
    'Pequeños Electrodomésticos',
    'Accesorios y Cables',
  ],
  FERRETERIA: [
    'Herramientas Manuales',
    'Herramientas Eléctricas',
    'Materiales de Construcción',
    'Pinturas y Revestimientos',
    'Plomería',
    'Electricidad',
    'Fijaciones y Tornillería',
    'Seguridad',
  ],
  SUPERMERCADO: [
    'Almacén',
    'Bebidas',
    'Lácteos y Huevos',
    'Carnes y Fiambres',
    'Frutas y Verduras',
    'Limpieza y Hogar',
    'Cuidado Personal',
    'Congelados',
  ],
  // Carpintería/mueblería: mezcla materia prima (madera, herrajes) con
  // producto terminado propio (los muebles) — ver ProductKind.
  MUEBLERIA: [
    'Muebles Terminados',
    'Maderas y Tableros',
    'Herrajes y Fijaciones',
    'Adhesivos y Selladores',
    'Pinturas y Barnices',
    'Tapicería y Telas',
    'Insumos de Taller',
  ],
  SERVICIOS: ['Servicios', 'Insumos', 'Repuestos'],
  OTRO: ['General', 'Otros'],
};

// Fallback cuando el tenant no eligió rubro (industry null).
const FALLBACK_CATEGORIES = DEFAULT_CATEGORIES.OTRO;

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  seedDefaults(
    tenantId: string,
    industry: Industry | null | undefined,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const names = industry
      ? DEFAULT_CATEGORIES[industry]
      : FALLBACK_CATEGORIES;
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
