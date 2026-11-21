import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/** Lecturas de los productos de Inventario que Compras necesita. */
@Injectable()
export class ProcurementSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Se valida en el servicio que las fichas que se compran estén activas.
  findProductStatuses(tenantId: string, ids: string[]) {
    return this.prisma.product.findMany({
      where: { tenantId, id: { in: ids }, deletedAt: null },
      select: { id: true, name: true, status: true, isPurchasable: true },
    });
  }

  findProductsForMatching(tenantId: string, productIds: string[]) {
    return this.prisma.product.findMany({
      where: { tenantId, id: { in: productIds }, deletedAt: null },
      select: { id: true, name: true, model: true },
    });
  }

  productExists(tenantId: string, productId: string) {
    return this.prisma.product.findFirst({
      where: { tenantId, id: productId, deletedAt: null },
      select: { id: true, name: true },
    });
  }
}
