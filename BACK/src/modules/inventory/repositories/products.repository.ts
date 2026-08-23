import { Injectable } from '@nestjs/common';
import { MovementReason, Prisma, StockMovementType } from '@prisma/client';
import { randomUUID } from 'crypto';
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

  // Fetches multiple products in a single query — use this in loops to avoid N+1.
  findManyByIds(tenantId: string, ids: string[]) {
    return this.prisma.product.findMany({
      where: { tenantId, id: { in: ids }, deletedAt: null },
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

  async findAllWithStock(tenantId: string, filters: ProductFilters = {}) {
    const products = await this.findAll(tenantId, filters);
    if (products.length === 0) return [];

    const nonSerialized = products
      .filter((p) => !p.isSerialized)
      .map((p) => p.id);
    const serialized = products.filter((p) => p.isSerialized).map((p) => p.id);

    const [movSums, unitCounts] = await Promise.all([
      nonSerialized.length > 0
        ? this.prisma.stockMovement.groupBy({
            by: ['productId'],
            where: { tenantId, productId: { in: nonSerialized } },
            _sum: { quantity: true },
          })
        : [],
      serialized.length > 0
        ? this.prisma.productUnit.groupBy({
            by: ['productId'],
            where: {
              tenantId,
              productId: { in: serialized },
              status: 'IN_STOCK',
            },
            _count: { id: true },
          })
        : [],
    ]);

    const stockMap = new Map<string, number>();
    (
      movSums as { productId: string; _sum: { quantity: number | null } }[]
    ).forEach((s) => stockMap.set(s.productId, s._sum.quantity ?? 0));
    (unitCounts as { productId: string; _count: { id: number } }[]).forEach(
      (s) => stockMap.set(s.productId, s._count.id),
    );

    return products.map((p) => ({ ...p, stock: stockMap.get(p.id) ?? 0 }));
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

  createStockMovement(
    tenantId: string,
    productId: string,
    data: {
      type: StockMovementType;
      reason?: MovementReason;
      quantity: number;
      warehouseId?: string;
      referenceId?: string;
      notes?: string;
    },
  ) {
    return this.prisma.stockMovement.create({
      data: { tenantId, productId, ...data },
    });
  }

  findMovements(
    tenantId: string,
    filters: {
      productId?: string;
      warehouseId?: string;
      reason?: MovementReason;
      take?: number;
      skip?: number;
    } = {},
  ) {
    return this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        ...(filters.productId && { productId: filters.productId }),
        ...(filters.warehouseId && { warehouseId: filters.warehouseId }),
        ...(filters.reason && { reason: filters.reason }),
      },
      include: {
        product: { select: { id: true, name: true, model: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filters.take ?? 50,
      skip: filters.skip ?? 0,
    });
  }

  createTransferMovements(
    tenantId: string,
    productId: string,
    data: {
      quantity: number;
      fromWarehouseId?: string;
      toWarehouseId: string;
      notes?: string;
    },
  ) {
    const referenceId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const out = await tx.stockMovement.create({
        data: {
          tenantId,
          productId,
          type: 'OUT',
          reason: 'TRANSFER',
          quantity: -data.quantity,
          warehouseId: data.fromWarehouseId,
          referenceId,
          notes: data.notes,
        },
      });
      const inMovement = await tx.stockMovement.create({
        data: {
          tenantId,
          productId,
          type: 'IN',
          reason: 'TRANSFER',
          quantity: data.quantity,
          warehouseId: data.toWarehouseId,
          referenceId,
          notes: data.notes,
        },
      });
      return [out, inMovement];
    });
  }

  async getStockByWarehouse(
    tenantId: string,
    productId: string,
    warehouseId: string,
  ): Promise<number> {
    const result = await this.prisma.stockMovement.aggregate({
      where: { tenantId, productId, warehouseId },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }
}
