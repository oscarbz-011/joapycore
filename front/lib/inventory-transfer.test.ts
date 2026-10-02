import { describe, expect, it } from 'vitest';
import type { StockResult, StockRow } from './api/inventory';
import {
  UNLOCATED_SOURCE,
  buildTransferRequest,
  transferDestinations,
  transferSources,
  type TransferForm,
} from './inventory-transfer';

const row: StockRow = {
  product: {
    id: 'product-1',
    name: 'Ventilador',
    model: null,
    category: null,
    brand: null,
    salesChannels: ['NORMAL'],
    salePrice: 100,
    stockMin: 0,
  },
  totalStock: 8,
  stockByWarehouse: [
    { warehouseId: 'main', warehouseName: 'Principal', isActive: true, quantity: 10 },
    { warehouseId: 'empty', warehouseName: 'Encarnación', isActive: true, quantity: 0 },
    { warehouseId: 'old', warehouseName: 'Anterior', isActive: false, quantity: 3 },
  ],
  unassignedStock: -2,
};

const warehouses: StockResult['warehouses'] = [
  { id: 'main', name: 'Principal', isActive: true },
  { id: 'empty', name: 'Encarnación', isActive: true },
  { id: 'old', name: 'Anterior', isActive: false },
];

const form: TransferForm = {
  productId: 'product-1',
  isSerialized: false,
  fromId: 'main',
  toWarehouseId: 'empty',
  quantity: 4,
  serialNumbers: [],
  notes: '',
};

describe('transferSources', () => {
  it('offers unlocated stock first and only active warehouses holding stock', () => {
    expect(transferSources(row)).toEqual([
      { id: UNLOCATED_SOURCE, label: 'Sin depósito asignado', quantity: -2 },
      { id: 'main', label: 'Principal', quantity: 10 },
    ]);
  });

  it('omits the unlocated source when nothing is unlocated', () => {
    expect(
      transferSources({ ...row, unassignedStock: 0 }).map((source) => source.id),
    ).toEqual(['main']);
  });

  it('has no sources before a product is chosen', () => {
    expect(transferSources(null)).toEqual([]);
  });
});

describe('transferDestinations', () => {
  it('lists active warehouses except the origin', () => {
    expect(
      transferDestinations(warehouses, 'main').map((warehouse) => warehouse.id),
    ).toEqual(['empty']);
  });

  it('lists every active warehouse for unlocated stock', () => {
    expect(
      transferDestinations(warehouses, UNLOCATED_SOURCE).map(
        (warehouse) => warehouse.id,
      ),
    ).toEqual(['main', 'empty']);
  });
});

describe('buildTransferRequest', () => {
  it('builds a transfer between two warehouses', () => {
    expect(buildTransferRequest(form, 10)).toEqual({
      kind: 'transfer',
      payload: {
        productId: 'product-1',
        reason: 'TRANSFER',
        direction: undefined,
        quantity: 4,
        warehouseId: 'main',
        toWarehouseId: 'empty',
        serialNumbers: undefined,
        notes: undefined,
      },
    });
  });

  it('rejects moving more than the origin holds', () => {
    expect(() => buildTransferRequest({ ...form, quantity: 11 }, 10)).toThrow(
      'El origen solo tiene 10',
    );
  });

  it('builds an assignment for unlocated stock', () => {
    expect(
      buildTransferRequest(
        { ...form, fromId: UNLOCATED_SOURCE, toWarehouseId: 'main', quantity: 2, notes: ' Conteo ' },
        -2,
      ),
    ).toEqual({
      kind: 'assign',
      payload: {
        productId: 'product-1',
        warehouseId: 'main',
        quantity: 2,
        serialNumbers: undefined,
        notes: 'Conteo',
      },
    });
  });

  it('rejects assigning more than the unlocated balance, whatever its sign', () => {
    expect(() =>
      buildTransferRequest(
        { ...form, fromId: UNLOCATED_SOURCE, toWarehouseId: 'main', quantity: 3 },
        -2,
      ),
    ).toThrow('El origen solo tiene 2');
  });

  it('sends the chosen serials and no quantity for serialized unlocated units', () => {
    expect(
      buildTransferRequest(
        {
          ...form,
          isSerialized: true,
          fromId: UNLOCATED_SOURCE,
          toWarehouseId: 'main',
          quantity: 0,
          serialNumbers: ['SN-1', ' SN-2 '],
        },
        2,
      ),
    ).toEqual({
      kind: 'assign',
      payload: {
        productId: 'product-1',
        warehouseId: 'main',
        quantity: undefined,
        serialNumbers: ['SN-1', 'SN-2'],
        notes: undefined,
      },
    });
  });

  it('requires serials for a serialized product', () => {
    expect(() =>
      buildTransferRequest({ ...form, isSerialized: true, quantity: 0 }, 10),
    ).toThrow('Seleccioná al menos un número de serie');
  });

  it('requires product, origin and a different destination', () => {
    expect(() => buildTransferRequest({ ...form, productId: '' }, 10)).toThrow(
      'Seleccioná un producto',
    );
    expect(() => buildTransferRequest({ ...form, fromId: '' }, 10)).toThrow(
      'Seleccioná el origen',
    );
    expect(() =>
      buildTransferRequest({ ...form, toWarehouseId: '' }, 10),
    ).toThrow('Seleccioná el depósito destino');
    expect(() =>
      buildTransferRequest({ ...form, toWarehouseId: 'main' }, 10),
    ).toThrow('deben ser distintos');
  });
});
