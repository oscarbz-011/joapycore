import type {
  CreateGlobalMovementPayload,
  MovementReason,
} from './api/inventory';

export interface MovementForm {
  productId: string;
  isSerialized: boolean;
  reason: MovementReason;
  direction: 'IN' | 'OUT';
  quantity: number;
  serialNumbers: string[];
  warehouseId: string;
  toWarehouseId: string;
  notes: string;
}

export function buildMovementPayload(
  input: MovementForm,
): CreateGlobalMovementPayload {
  if (!input.productId) throw new Error('Seleccioná un producto');
  if (!input.warehouseId) throw new Error('Seleccioná un depósito');
  if (input.reason === 'TRANSFER') {
    if (!input.toWarehouseId) throw new Error('Seleccioná el depósito destino');
    if (input.warehouseId === input.toWarehouseId) {
      throw new Error('Los depósitos de origen y destino deben ser distintos');
    }
  }

  const serialNumbers = input.serialNumbers
    .map((serial) => serial.trim())
    .filter(Boolean);
  if (input.isSerialized) {
    if (serialNumbers.length === 0) {
      throw new Error('Ingresá al menos un número de serie');
    }
    if (new Set(serialNumbers).size !== serialNumbers.length) {
      throw new Error('Los números de serie no pueden repetirse');
    }
  } else if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error('La cantidad debe ser mayor a cero');
  }

  return {
    productId: input.productId,
    reason: input.reason,
    direction: input.reason === 'ADJUSTMENT' ? input.direction : undefined,
    quantity: input.isSerialized ? serialNumbers.length : input.quantity,
    warehouseId: input.warehouseId,
    toWarehouseId:
      input.reason === 'TRANSFER' ? input.toWarehouseId : undefined,
    serialNumbers: input.isSerialized ? serialNumbers : undefined,
    notes: input.notes.trim() || undefined,
  };
}
