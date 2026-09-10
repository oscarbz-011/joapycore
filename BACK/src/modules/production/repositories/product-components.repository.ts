import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const COMPONENT_INCLUDE = {
  component: {
    select: {
      id: true,
      name: true,
      unit: true,
      kind: true,
      costPrice: true,
    },
  },
} as const;

@Injectable()
export class ProductComponentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProduct(tenantId: string, productId: string) {
    return this.prisma.productComponent.findMany({
      where: { tenantId, productId },
      include: COMPONENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  findOne(tenantId: string, id: string) {
    return this.prisma.productComponent.findFirst({
      where: { tenantId, id },
      include: COMPONENT_INCLUDE,
    });
  }

  findExisting(tenantId: string, productId: string, componentId: string) {
    return this.prisma.productComponent.findFirst({
      where: { tenantId, productId, componentId },
    });
  }

  create(
    tenantId: string,
    data: { productId: string; componentId: string; quantity: number; notes?: string },
  ) {
    return this.prisma.productComponent.create({
      data: { ...data, tenantId },
      include: COMPONENT_INCLUDE,
    });
  }

  update(
    tenantId: string,
    id: string,
    data: { quantity?: number; notes?: string | null },
  ) {
    return this.prisma.productComponent.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  delete(tenantId: string, id: string) {
    return this.prisma.productComponent.deleteMany({ where: { tenantId, id } });
  }

  // Producto + su tipo, para validar que la receta se arme sobre algo
  // fabricado y que el componente exista en el mismo tenant.
  findProduct(tenantId: string, id: string) {
    return this.prisma.product.findFirst({
      where: { tenantId, id, deletedAt: null },
      select: { id: true, name: true, kind: true, unit: true },
    });
  }

  // Los componentes directos de un producto — lo usa la detección de ciclos
  // del servicio para recorrer la receta hacia abajo.
  findComponentIds(tenantId: string, productId: string) {
    return this.prisma.productComponent.findMany({
      where: { tenantId, productId },
      select: { componentId: true },
    });
  }
}
