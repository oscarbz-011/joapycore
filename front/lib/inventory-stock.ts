import type { StockResult, StockRow } from './api/inventory';

export interface StockColumn {
  key: string;
  label: string;
  warehouseId: string | null;
  kind: 'total' | 'warehouse' | 'unassigned';
  isInactive: boolean;
}

export function stockColumns(
  result: StockResult,
  selectedWarehouseId: string | null,
): StockColumn[] {
  const columns: StockColumn[] = [
    {
      key: 'total',
      label: 'Total general',
      warehouseId: null,
      kind: 'total',
      isInactive: false,
    },
  ];
  const warehouses = selectedWarehouseId
    ? result.warehouses.filter(
        (warehouse) => warehouse.id === selectedWarehouseId,
      )
    : result.warehouses;

  columns.push(
    ...warehouses.map((warehouse) => ({
      key: `warehouse:${warehouse.id}`,
      label: warehouse.name,
      warehouseId: warehouse.id,
      kind: 'warehouse' as const,
      isInactive: !warehouse.isActive,
    })),
  );

  if (!selectedWarehouseId) {
    columns.push({
      key: 'unassigned',
      label: 'Sin depósito asignado',
      warehouseId: null,
      kind: 'unassigned',
      isInactive: false,
    });
  }

  return columns;
}

export function stockQuantity(row: StockRow, column: StockColumn): number {
  if (column.kind === 'total') return row.totalStock;
  if (column.kind === 'unassigned') return row.unassignedStock;
  return (
    row.stockByWarehouse.find(
      (quantity) => quantity.warehouseId === column.warehouseId,
    )?.quantity ?? 0
  );
}

export type StockLevel = 'out' | 'low' | 'ok';

/**
 * Nivel de reposición según el total de la empresa. minimum = 0 significa
 * "sin mínimo configurado": el producto solo se marca cuando se queda sin stock.
 */
export function stockLevel(total: number, minimum: number): StockLevel {
  if (total <= 0) return 'out';
  if (minimum > 0 && total <= minimum) return 'low';
  return 'ok';
}

export function needsRestock(row: StockRow): boolean {
  return stockLevel(row.totalStock, row.product.reorderPoint) !== 'ok';
}
