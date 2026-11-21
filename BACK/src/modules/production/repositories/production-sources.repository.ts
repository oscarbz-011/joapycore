import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/** Lecturas de productos y stock de Inventario que Producción necesita. */
@Injectable()
export class ProductionSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProduct(tenantId: string, id: string) {
    return this.prisma.product.findFirst({
      where: { tenantId, id, deletedAt: null },
      select: {
        id: true,
        name: true,
        kind: true,
        status: true,
        unit: true,
        isSerialized: true,
      },
    });
  }

  // Stock disponible por producto, sumando movimientos (nunca un campo de
  // stock en la ficha).
  async getStock(tenantId: string, productIds: string[]) {
    const sums = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { tenantId, productId: { in: productIds } },
      _sum: { quantity: true },
    });
    return new Map(sums.map((s) => [s.productId, s._sum.quantity ?? 0]));
  }
}
