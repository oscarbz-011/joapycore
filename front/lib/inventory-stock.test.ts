import { describe, expect, it } from 'vitest';
import type { StockResult, StockRow } from './api/inventory';
import {
  needsRestock,
  stockColumns,
  stockLevel,
  stockQuantity,
} from './inventory-stock';

const row: StockRow = {
  product: {
    id: 'product-1',
    name: 'Producto',
    model: null,
    category: null,
    brand: null,
    salesChannels: ['NORMAL'],
    salePrice: 1725000,
    stockMin: 0,
    reorderPoint: 0,
    reorderPointSource: null,
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

describe('stock level', () => {
  it('flags a product with no stock regardless of its minimum', () => {
    expect(stockLevel(0, 0)).toBe('out');
    expect(stockLevel(-2, 5)).toBe('out');
  });

  it('flags a product at or below its minimum', () => {
    expect(stockLevel(5, 5)).toBe('low');
    expect(stockLevel(2, 5)).toBe('low');
  });

  it('does not flag a product above its minimum or without a minimum', () => {
    expect(stockLevel(6, 5)).toBe('ok');
    expect(stockLevel(1, 0)).toBe('ok');
  });

  it('uses the company total, not one warehouse, to decide restocking', () => {
    expect(needsRestock(row)).toBe(false);
    expect(
      needsRestock({
        ...row,
        product: { ...row.product, reorderPoint: 5, reorderPointSource: 'ALERT' },
      }),
    ).toBe(true);
  });
});
