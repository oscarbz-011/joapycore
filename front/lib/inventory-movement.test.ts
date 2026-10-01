import { describe, expect, it } from 'vitest';
import { buildMovementPayload } from './inventory-movement';

describe('buildMovementPayload', () => {
  it('uses quantity for a non-serialized movement', () => {
    expect(
      buildMovementPayload({
        productId: 'plain',
        isSerialized: false,
        reason: 'PURCHASE',
        direction: 'IN',
        quantity: 4,
        serialNumbers: [],
        warehouseId: 'warehouse-1',
        toWarehouseId: '',
        notes: 'Ingreso',
      }),
    ).toEqual({
      productId: 'plain',
      reason: 'PURCHASE',
      direction: undefined,
      quantity: 4,
      warehouseId: 'warehouse-1',
      toWarehouseId: undefined,
      serialNumbers: undefined,
      notes: 'Ingreso',
    });
  });

  it('requires an active warehouse selection for every movement payload', () => {
    expect(() =>
      buildMovementPayload({
        productId: 'plain',
        isSerialized: false,
        reason: 'ADJUSTMENT',
        direction: 'IN',
        quantity: 1,
        serialNumbers: [],
        warehouseId: '',
        toWarehouseId: '',
        notes: '',
      }),
    ).toThrow('Seleccioná un depósito');
  });

  it('uses unique serial numbers as the quantity for serialized entries', () => {
    expect(
      buildMovementPayload({
        productId: 'serial',
        isSerialized: true,
        reason: 'PURCHASE',
        direction: 'IN',
        quantity: 0,
        serialNumbers: [' SN-1 ', 'SN-2'],
        warehouseId: 'warehouse-1',
        toWarehouseId: '',
        notes: '',
      }),
    ).toMatchObject({
      quantity: 2,
      serialNumbers: ['SN-1', 'SN-2'],
      warehouseId: 'warehouse-1',
    });

    expect(() =>
      buildMovementPayload({
        productId: 'serial',
        isSerialized: true,
        reason: 'PURCHASE',
        direction: 'IN',
        quantity: 0,
        serialNumbers: ['SN-1', 'SN-1'],
        warehouseId: 'warehouse-1',
        toWarehouseId: '',
        notes: '',
      }),
    ).toThrow('Los números de serie no pueden repetirse');
  });

  it('requires selected serials and distinct warehouses for serialized transfers', () => {
    expect(
      buildMovementPayload({
        productId: 'serial',
        isSerialized: true,
        reason: 'TRANSFER',
        direction: 'IN',
        quantity: 0,
        serialNumbers: ['SN-1', 'SN-2'],
        warehouseId: 'origin',
        toWarehouseId: 'destination',
        notes: '',
      }),
    ).toMatchObject({
      quantity: 2,
      serialNumbers: ['SN-1', 'SN-2'],
      warehouseId: 'origin',
      toWarehouseId: 'destination',
    });

    expect(() =>
      buildMovementPayload({
        productId: 'serial',
        isSerialized: true,
        reason: 'TRANSFER',
        direction: 'IN',
        quantity: 0,
        serialNumbers: ['SN-1'],
        warehouseId: 'same',
        toWarehouseId: 'same',
        notes: '',
      }),
    ).toThrow('Los depósitos de origen y destino deben ser distintos');
  });
});
