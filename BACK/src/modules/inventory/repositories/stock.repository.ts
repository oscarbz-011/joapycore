import { qty, sumQty, type Quantity } from '../../../common/units/quantity';
import type { Prisma } from '@prisma/client';
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
  quantity: Quantity;
}

export interface StockRow {
  product: {
    id: string;
    name: string;
    model: string | null;
    category: { id: string; name: string } | null;
    brand: { id: string; name: string } | null;
    salesChannels: OrderChannel[];
    salePrice: number | null;
    stockMin: Prisma.Decimal;
  };
  totalStock: Quantity;
  stockByWarehouse: StockWarehouseQuantity[];
  unassignedStock: Quantity;
}

export interface StockResult {
  warehouses: StockWarehouse[];
  items: StockRow[];
}

@Injectable()
export class StockRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `warehouses`: los depósitos de la empresa, activos primero. */
  async findAll(
    tenantId: string,
    filters: FilterStockDto,
    warehouses: StockWarehouse[],
  ): Promise<StockResult> {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        // Pedir un producto puntual devuelve su ubicación aunque no sea
        // vendible: una materia prima también puede tener stock sin depósito.
        ...(filters.productId
          ? { id: filters.productId }
          : { status: 'ACTIVE', salesChannels: { isEmpty: false } }),
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
        salePrice: true,
        stockMin: true,
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

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

    const quantities = new Map<string, Map<string | null, Quantity>>();
    const setQuantity = (
      productId: string,
      warehouseId: string | null,
      quantity: Quantity,
    ) => {
      const byWarehouse =
        quantities.get(productId) ?? new Map<string | null, Quantity>();
      byWarehouse.set(warehouseId, quantity);
      quantities.set(productId, byWarehouse);
    };
    for (const group of movementGroups) {
      setQuantity(group.productId, group.warehouseId, qty(group._sum.quantity));
    }
    for (const group of unitGroups) {
      setQuantity(group.productId, group.warehouseId, qty(group._count.id));
    }

    const warehouseTotals = new Map<string, Quantity>();
    for (const byWarehouse of quantities.values()) {
      for (const [warehouseId, quantity] of byWarehouse) {
        if (warehouseId) {
          warehouseTotals.set(
            warehouseId,
            qty(warehouseTotals.get(warehouseId)).plus(quantity),
          );
        }
      }
    }
    const visibleWarehouses = warehouses.filter(
      (warehouse) =>
        warehouse.isActive || !qty(warehouseTotals.get(warehouse.id)).isZero(),
    );
    const rowWarehouses = filters.warehouseId
      ? visibleWarehouses.filter(
          (warehouse) => warehouse.id === filters.warehouseId,
        )
      : visibleWarehouses;

    return {
      warehouses: visibleWarehouses,
      items: products.map((source) => {
        const { isSerialized: _isSerialized, salePrice, ...rest } = source;
        const product = {
          ...rest,
          salePrice: salePrice === null ? null : Number(salePrice),
        };
        const byWarehouse =
          quantities.get(product.id) ?? new Map<string | null, Quantity>();
        return {
          product,
          totalStock: sumQty([...byWarehouse.values()]),
          stockByWarehouse: rowWarehouses.map((warehouse) => ({
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
            isActive: warehouse.isActive,
            quantity: qty(byWarehouse.get(warehouse.id)),
          })),
          unassignedStock: qty(byWarehouse.get(null)),
        };
      }),
    };
  }
}
