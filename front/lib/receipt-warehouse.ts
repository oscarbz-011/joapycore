import type { Warehouse } from '@/lib/api/warehouses';

// Un depósito inactivo no recibe mercadería: el backend lo rechaza.
export function receivingWarehouses(warehouses: Warehouse[]): Warehouse[] {
  return warehouses.filter((w) => w.isActive);
}

export function initialReceiptWarehouseId(warehouses: Warehouse[]): string {
  const active = receivingWarehouses(warehouses);
  return active.length === 1 ? active[0].id : '';
}
