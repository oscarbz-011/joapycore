import { Injectable } from '@nestjs/common';
import type { OrderChannel } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { FilterStockDto } from '../dto/filter-stock.dto';

export interface StockWarehouse {
  id: string;
  name: string;
  isActive: boolean;
}

export interface StockWarehouseQuantity {
  warehouseId: string;
  warehouseName: string;
  isActive: boolean;
  quantity: number;
}

export interface StockRow {
  product: {
    id: string;
    name: string;
    model: string | null;
    category: { id: string; name: string } | null;
    brand: { id: string; name: string } | null;
    salesChannels: OrderChannel[];
  };
  totalStock: number;
  stockByWarehouse: StockWarehouseQuantity[];
  unassignedStock: number;
}

export interface StockResult {
  warehouses: StockWarehouse[];
  items: StockRow[];
}

@Injectable()
export class StockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    filters: FilterStockDto,
  ): Promise<StockResult> {
    const [warehouses, products] = await Promise.all([
      this.prisma.warehouse.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.product.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: 'ACTIVE',
          salesChannels: { isEmpty: false },
          ...(filters.categoryId && { categoryId: filters.categoryId }),
          ...(filters.brandId && { brandId: filters.brandId }),
          ...(filters.search && {
            OR: [
              {
                name: {
                  contains: filters.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                model: {
                  contains: filters.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }),
        },
        select: {
          id: true,
          name: true,
          model: true,
          isSerialized: true,
          salesChannels: true,
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const plainIds = products
      .filter((product) => !product.isSerialized)
      .map((product) => product.id);
    const serializedIds = products
      .filter((product) => product.isSerialized)
      .map((product) => product.id);
    const [movementGroups, unitGroups] = await Promise.all([
      plainIds.length
        ? this.prisma.stockMovement.groupBy({
            by: ['productId', 'warehouseId'],
            where: { tenantId, productId: { in: plainIds } },
            _sum: { quantity: true },
          })
        : [],
      serializedIds.length
        ? this.prisma.productUnit.groupBy({
            by: ['productId', 'warehouseId'],
            where: {
              tenantId,
              productId: { in: serializedIds },
              status: 'IN_STOCK',
            },
            _count: { id: true },
          })
        : [],
    ]);

    const quantities = new Map<string, Map<string | null, number>>();
    const setQuantity = (
      productId: string,
      warehouseId: string | null,
      quantity: number,
    ) => {
      const byWarehouse =
        quantities.get(productId) ?? new Map<string | null, number>();
      byWarehouse.set(warehouseId, quantity);
      quantities.set(productId, byWarehouse);
    };
    for (const group of movementGroups) {
      setQuantity(group.productId, group.warehouseId, group._sum.quantity ?? 0);
    }
    for (const group of unitGroups) {
      setQuantity(group.productId, group.warehouseId, group._count.id);
    }

    const warehouseTotals = new Map<string, number>();
    for (const byWarehouse of quantities.values()) {
      for (const [warehouseId, quantity] of byWarehouse) {
        if (warehouseId) {
          warehouseTotals.set(
            warehouseId,
            (warehouseTotals.get(warehouseId) ?? 0) + quantity,
          );
        }
      }
    }
    const visibleWarehouses = warehouses.filter(
      (warehouse) =>
        warehouse.isActive || (warehouseTotals.get(warehouse.id) ?? 0) !== 0,
    );
    const rowWarehouses = filters.warehouseId
      ? visibleWarehouses.filter(
          (warehouse) => warehouse.id === filters.warehouseId,
        )
      : visibleWarehouses;

    return {
      warehouses: visibleWarehouses,
      items: products.map(({ isSerialized: _isSerialized, ...product }) => {
        const byWarehouse =
          quantities.get(product.id) ?? new Map<string | null, number>();
        return {
          product,
          totalStock: [...byWarehouse.values()].reduce(
            (total, quantity) => total + quantity,
            0,
          ),
          stockByWarehouse: rowWarehouses.map((warehouse) => ({
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
            isActive: warehouse.isActive,
            quantity: byWarehouse.get(warehouse.id) ?? 0,
          })),
          unassignedStock: byWarehouse.get(null) ?? 0,
        };
      }),
    };
  }
}
