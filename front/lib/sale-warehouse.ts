import type { StockResult } from './api/inventory';

export interface WarehouseChoice {
  id: string;
  name: string;
  // Existencia del producto en ese depósito.
  quantity: number;
}

/** Depósitos activos desde los que se puede despachar un producto, con su stock. */
export function warehouseChoices(
  stock: StockResult | undefined,
  productId: string,
): WarehouseChoice[] {
  if (!stock || !productId) return [];
  const row = stock.items.find((item) => item.product.id === productId);
  return stock.warehouses
    .filter((warehouse) => warehouse.isActive)
    .map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      quantity:
        row?.stockByWarehouse.find(
          (location) => location.warehouseId === warehouse.id,
        )?.quantity ?? 0,
    }));
}

/**
 * Depósito sugerido: el que más stock tiene entre los que cubren la cantidad;
 * si ninguno la cubre, el que más tiene. Sin stock en ningún lado se propone
 * el primero, para no dejar la línea sin depósito (el backend lo exige y
 * valida la existencia).
 */
export function defaultWarehouseId(
  choices: WarehouseChoice[],
  quantity: number,
): string {
  if (choices.length === 0) return '';
  const byStock = [...choices].sort((a, b) => b.quantity - a.quantity);
  const covering = byStock.find((choice) => choice.quantity >= quantity);
  return (covering ?? byStock[0]).id;
}

/** El depósito elegido por el usuario si sigue disponible; si no, el sugerido. */
export function resolveWarehouseId(
  selected: string | undefined,
  choices: WarehouseChoice[],
  quantity: number,
): string {
  return selected && choices.some((choice) => choice.id === selected)
    ? selected
    : defaultWarehouseId(choices, quantity);
}

/** Stock del producto que no está en ningún depósito (dato histórico). */
export function unassignedStock(
  stock: StockResult | undefined,
  productId: string,
): number {
  return (
    stock?.items.find((item) => item.product.id === productId)
      ?.unassignedStock ?? 0
  );
}
