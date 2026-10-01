import { describe, expect, it } from 'vitest';
import type { StockResult, StockRow } from './api/inventory';
import { stockColumns, stockQuantity } from './inventory-stock';

const row: StockRow = {
  product: {
    id: 'product-1',
    name: 'Producto',
    model: null,
    category: null,
    brand: null,
    salesChannels: ['NORMAL'],
  },
  totalStock: 5,
  stockByWarehouse: [
    {
      warehouseId: 'active',
      warehouseName: 'Central',
      isActive: true,
      quantity: 5,
    },
    {
      warehouseId: 'inactive',
      warehouseName: 'Anterior',
      isActive: false,
      quantity: 0,
    },
  ],
  unassignedStock: 0,
};

const result: StockResult = {
  warehouses: [
    { id: 'active', name: 'Central', isActive: true },
    { id: 'inactive', name: 'Anterior', isActive: false },
  ],
  items: [row],
};

describe('inventory stock columns', () => {
  it('shows company total, every location, and unassigned stock in Todos', () => {
    expect(stockColumns(result, null).map((column) => column.key)).toEqual([
      'total',
      'warehouse:active',
      'warehouse:inactive',
      'unassigned',
    ]);
  });

  it('shows company total and only the selected warehouse', () => {
    expect(
      stockColumns(result, 'inactive').map((column) => ({
        key: column.key,
        inactive: column.isInactive,
      })),
    ).toEqual([
      { key: 'total', inactive: false },
      { key: 'warehouse:inactive', inactive: true },
    ]);
  });

  it('keeps unassigned and zero quantities as explicit values', () => {
    const allColumns = stockColumns(result, null);
    expect(
      stockQuantity(
        row,
        allColumns.find((column) => column.key === 'unassigned')!,
      ),
    ).toBe(0);
    expect(
      stockQuantity(
        row,
        allColumns.find(
          (column) => column.key === 'warehouse:inactive',
        )!,
      ),
    ).toBe(0);
  });
});
