import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface ProductFilters {
  categoryId?: string;
  brandId?: string;
  isSerialized?: boolean;
  isActive?: boolean;
  search?: string;
}

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, filters: ProductFilters = {}) {
    const where: Prisma.ProductWhereInput = {
      tenantId,
      deletedAt: null,
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.brandId && { brandId: filters.brandId }),
      ...(filters.isSerialized !== undefined && {
        isSerialized: filters.isSerialized,
      }),
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { model: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
    };
    return this.prisma.product.findMany({
      where,
      include: { brand: true, category: true },
      orderBy: { name: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.product.findFirst({
      where: { tenantId, id, deletedAt: null },
      include: { brand: true, category: true },
    });
  }

  create(
    tenantId: string,
    data: Omit<Prisma.ProductUncheckedCreateInput, 'tenantId'>,
  ) {
    return this.prisma.product.create({ data: { ...data, tenantId } });
  }

  update(tenantId: string, id: string, data: Prisma.ProductUpdateInput) {
    return this.prisma.product.updateMany({
      where: { tenantId, id, deletedAt: null },
      data,
    });
  }

  softDelete(tenantId: string, id: string) {
    return this.prisma.product.updateMany({
      where: { tenantId, id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // Stock for non-serialized products: sum of movements
  async getStock(tenantId: string, productId: string): Promise<number> {
    const result = await this.prisma.stockMovement.aggregate({
      where: { tenantId, productId },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  // Stock for serialized products: count of IN_STOCK units
  getSerializedStock(tenantId: string, productId: string) {
    return this.prisma.productUnit.count({
      where: { tenantId, productId, status: 'IN_STOCK' },
    });
  }
}
