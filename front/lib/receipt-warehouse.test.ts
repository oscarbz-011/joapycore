import { describe, expect, it } from 'vitest';
import type { Warehouse } from '@/lib/api/warehouses';
import { initialReceiptWarehouseId, receivingWarehouses } from './receipt-warehouse';

const warehouse = (id: string, isActive = true) => ({ id, name: id, isActive }) as Warehouse;

describe('receivingWarehouses', () => {
  it('leaves out inactive warehouses', () => {
    expect(receivingWarehouses([warehouse('a'), warehouse('b', false)]).map((w) => w.id)).toEqual(['a']);
  });
});

describe('initialReceiptWarehouseId', () => {
  it('picks the only active warehouse', () => {
    expect(initialReceiptWarehouseId([warehouse('a'), warehouse('b', false)])).toBe('a');
  });

  it('lets the user choose when there are several', () => {
    expect(initialReceiptWarehouseId([warehouse('a'), warehouse('b')])).toBe('');
  });

  it('has nothing to pick without active warehouses', () => {
    expect(initialReceiptWarehouseId([])).toBe('');
    expect(initialReceiptWarehouseId([warehouse('a', false)])).toBe('');
  });
});
