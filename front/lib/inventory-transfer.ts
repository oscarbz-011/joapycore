import type {
  AssignUnlocatedStockPayload,
  CreateGlobalMovementPayload,
  StockRow,
  StockWarehouse,
} from './api/inventory';
import { buildMovementPayload } from './inventory-movement';

/** Origen que representa la existencia histórica sin depósito asignado. */
export const UNLOCATED_SOURCE = 'unlocated';

export interface TransferSource {
  id: string;
  label: string;
  quantity: number;
}

export interface TransferForm {
  productId: string;
  isSerialized: boolean;
  fromId: string;
  toWarehouseId: string;
  quantity: number;
  serialNumbers: string[];
  notes: string;
}

export type TransferRequest =
  | { kind: 'transfer'; payload: CreateGlobalMovementPayload }
  | { kind: 'assign'; payload: AssignUnlocatedStockPayload };

export function transferSources(row: StockRow | null): TransferSource[] {
  if (!row) return [];
  const sources: TransferSource[] = [];
  if (row.unassignedStock !== 0) {
    sources.push({
      id: UNLOCATED_SOURCE,
      label: 'Sin depósito asignado',
      quantity: row.unassignedStock,
    });
  }
  for (const location of row.stockByWarehouse) {
    if (location.isActive && location.quantity > 0) {
      sources.push({
        id: location.warehouseId,
        label: location.warehouseName,
        quantity: location.quantity,
      });
    }
  }
  return sources;
}

export function transferDestinations(
  warehouses: StockWarehouse[],
  fromId: string,
): StockWarehouse[] {
  return warehouses.filter(
    (warehouse) => warehouse.isActive && warehouse.id !== fromId,
  );
}

/**
 * `available` es la existencia del origen. Para el origen sin depósito puede
 * ser negativa (salidas históricas sin ubicación): se mueve su magnitud.
 */
export function buildTransferRequest(
  form: TransferForm,
  available: number,
): TransferRequest {
  if (!form.productId) throw new Error('Seleccioná un producto');
  if (!form.fromId) throw new Error('Seleccioná el origen');
  if (!form.toWarehouseId) throw new Error('Seleccioná el depósito destino');
  if (form.fromId === form.toWarehouseId) {
    throw new Error('Los depósitos de origen y destino deben ser distintos');
  }

  const serialNumbers = form.serialNumbers
    .map((serial) => serial.trim())
    .filter(Boolean);
  if (form.isSerialized) {
    if (serialNumbers.length === 0) {
      throw new Error('Seleccioná al menos un número de serie');
    }
  } else {
    if (!Number.isInteger(form.quantity) || form.quantity < 1) {
      throw new Error('La cantidad debe ser mayor a cero');
    }
    const limit = Math.abs(available);
    if (form.quantity > limit) {
      throw new Error(`El origen solo tiene ${limit}`);
    }
  }

  if (form.fromId === UNLOCATED_SOURCE) {
    return {
      kind: 'assign',
      payload: {
        productId: form.productId,
        warehouseId: form.toWarehouseId,
        quantity: form.isSerialized ? undefined : form.quantity,
        serialNumbers: form.isSerialized ? serialNumbers : undefined,
        notes: form.notes.trim() || undefined,
      },
    };
  }

  return {
    kind: 'transfer',
    payload: buildMovementPayload({
      productId: form.productId,
      isSerialized: form.isSerialized,
      reason: 'TRANSFER',
      direction: 'IN',
      quantity: form.quantity,
      serialNumbers,
      warehouseId: form.fromId,
      toWarehouseId: form.toWarehouseId,
      notes: form.notes,
    }),
  };
}
