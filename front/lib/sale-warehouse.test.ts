import { describe, expect, it } from 'vitest';
import type { StockResult } from './api/inventory';
import {
  defaultWarehouseId,
  resolveWarehouseId,
  unassignedStock,
  warehouseChoices,
} from './sale-warehouse';

const stock = {
  warehouses: [
    { id: 'enc', name: 'Encarnación', isActive: true },
    { id: 'main', name: 'Principal', isActive: true },
    { id: 'old', name: 'Anterior', isActive: false },
  ],
  items: [
    {
      product: { id: 'aire' },
      totalStock: 2,
      unassignedStock: 0,
      stockByWarehouse: [
        { warehouseId: 'enc', warehouseName: 'Encarnación', isActive: true, quantity: 0 },
        { warehouseId: 'main', warehouseName: 'Principal', isActive: true, quantity: 2 },
        { warehouseId: 'old', warehouseName: 'Anterior', isActive: false, quantity: 9 },
      ],
    },
    {
      product: { id: 'tv' },
      totalStock: 5,
      unassignedStock: 3,
      stockByWarehouse: [
        { warehouseId: 'enc', warehouseName: 'Encarnación', isActive: true, quantity: 2 },
        { warehouseId: 'main', warehouseName: 'Principal', isActive: true, quantity: 3 },
      ],
    },
  ],
} as unknown as StockResult;

describe('warehouseChoices', () => {
  it('lists only active warehouses with the stock of the product', () => {
    expect(warehouseChoices(stock, 'aire')).toEqual([
      { id: 'enc', name: 'Encarnación', quantity: 0 },
      { id: 'main', name: 'Principal', quantity: 2 },
    ]);
  });

  it('offers the active warehouses with zero stock for an unknown product', () => {
    expect(warehouseChoices(stock, 'nuevo').map((c) => c.quantity)).toEqual([0, 0]);
  });

  it('has no choices before the stock or the product is known', () => {
    expect(warehouseChoices(undefined, 'aire')).toEqual([]);
    expect(warehouseChoices(stock, '')).toEqual([]);
  });
});

describe('defaultWarehouseId', () => {
  it('picks the warehouse that holds the product', () => {
    expect(defaultWarehouseId(warehouseChoices(stock, 'aire'), 1)).toBe('main');
  });

  it('prefers a warehouse that covers the whole quantity', () => {
    expect(defaultWarehouseId(warehouseChoices(stock, 'tv'), 3)).toBe('main');
    expect(defaultWarehouseId(warehouseChoices(stock, 'tv'), 1)).toBe('main');
  });

  it('falls back to the warehouse with most stock when none covers the quantity', () => {
    expect(defaultWarehouseId(warehouseChoices(stock, 'tv'), 10)).toBe('main');
  });

  it('still proposes a warehouse when the product has no stock anywhere', () => {
    expect(defaultWarehouseId(warehouseChoices(stock, 'nuevo'), 1)).toBe('enc');
  });

  it('is empty when there are no active warehouses', () => {
    expect(defaultWarehouseId([], 1)).toBe('');
  });
});

describe('resolveWarehouseId', () => {
  const choices = warehouseChoices(stock, 'tv');

  it('keeps the warehouse chosen by the user', () => {
    expect(resolveWarehouseId('enc', choices, 3)).toBe('enc');
  });

  it('uses the suggestion when nothing or a stale warehouse is selected', () => {
    expect(resolveWarehouseId(undefined, choices, 1)).toBe('main');
    expect(resolveWarehouseId('old', choices, 1)).toBe('main');
  });
});

describe('unassignedStock', () => {
  it('reports the stock without a warehouse', () => {
    expect(unassignedStock(stock, 'tv')).toBe(3);
    expect(unassignedStock(stock, 'aire')).toBe(0);
    expect(unassignedStock(undefined, 'tv')).toBe(0);
  });
});
