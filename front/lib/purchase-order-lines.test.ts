import { describe, expect, it } from 'vitest';
import type { SupplierCatalogItem } from './api/procurement';
import {
  catalogChoices,
  emptyLine,
  lineFromCatalogItem,
  orderLinesError,
  orderLinesTotal,
  toOrderItems,
  withoutCatalogLines,
} from './purchase-order-lines';

const TODAY = '2026-10-06';

function catalogItem(
  overrides: Partial<SupplierCatalogItem> = {},
): SupplierCatalogItem {
  return {
    id: 'cat-1',
    supplierId: 'sup-1',
    supplierSku: '332726',
    description: 'ABRIDOR DE VINHO SMARTFY',
    price: 54_000,
    supplierUnit: null,
    conversionFactor: null,
    validFrom: null,
    validTo: null,
    minOrderQuantity: null,
    availability: null,
    availabilityUpdatedAt: null,
    priceTiers: [],
    productId: 'prod-1',
    product: { id: 'prod-1', name: 'Abridor de vino', unit: 'unidad' },
    ...overrides,
  };
}

describe('lineFromCatalogItem', () => {
  it('orders the linked product at the supplier unit cost', () => {
    expect(
      lineFromCatalogItem(
        catalogItem({ price: 120_000, conversionFactor: 12 }),
        TODAY,
      ),
    ).toMatchObject({
      productId: 'prod-1',
      productName: 'Abridor de vino',
      catalogItemId: 'cat-1',
      supplierSku: '332726',
      quantity: 1,
      unitCost: 10_000,
      priceNote: null,
    });
  });

  it('warns when the list price is no longer valid', () => {
    const line = lineFromCatalogItem(
      catalogItem({ validTo: '2026-09-30T00:00:00.000Z' }),
      TODAY,
    );

    expect(line?.priceNote).toBe('Precio de lista vencido el 30/09/2026');
  });

  it('warns when the item has no list price', () => {
    const line = lineFromCatalogItem(catalogItem({ price: null }), TODAY);

    expect(line?.unitCost).toBe(0);
    expect(line?.priceNote).toBe('El catálogo no trae precio para este ítem');
  });

  it('cannot order an item that is not linked to a product', () => {
    expect(
      lineFromCatalogItem(
        catalogItem({ productId: null, product: null }),
        TODAY,
      ),
    ).toBeNull();
  });
});

describe('order lines', () => {
  const catalogLine = lineFromCatalogItem(catalogItem(), TODAY)!;
  const looseLine = {
    ...emptyLine(),
    productId: 'prod-2',
    productName: 'Ventilador',
    quantity: 3,
    unitCost: 100_000,
  };

  it('adds up quantity by unit cost', () => {
    expect(orderLinesTotal([catalogLine, looseLine])).toBe(354_000);
  });

  it('sends the catalog item only for lines that came from the catalog', () => {
    expect(toOrderItems([catalogLine, looseLine])).toEqual([
      {
        productId: 'prod-1',
        quantity: 1,
        unitCost: 54_000,
        catalogItemId: 'cat-1',
      },
      { productId: 'prod-2', quantity: 3, unitCost: 100_000 },
    ]);
  });

  it('drops the catalog lines when the supplier changes', () => {
    expect(withoutCatalogLines([catalogLine, looseLine])).toEqual([looseLine]);
  });

  it.each([
    [[], 'al menos un producto'],
    [[emptyLine()], 'Elegí el producto'],
    [[{ ...looseLine, quantity: 0 }], 'cantidad'],
    [[{ ...looseLine, unitCost: 0 }], 'costo'],
    [[looseLine, { ...looseLine, key: 'other' }], 'repetido'],
  ])('explains what is wrong with %#', (lines, word) => {
    expect(orderLinesError(lines)).toContain(word);
  });

  it('accepts complete lines', () => {
    expect(orderLinesError([catalogLine, looseLine])).toBeNull();
  });
});

describe('catalogChoices', () => {
  const items = [
    catalogItem(),
    catalogItem({
      id: 'cat-2',
      supplierSku: '424447',
      description: 'ADAPTADOR CARPLAY',
      productId: null,
      product: null,
    }),
  ];

  it('searches by supplier code, description and linked product', () => {
    expect(catalogChoices(items, '4244').map((i) => i.id)).toEqual(['cat-2']);
    expect(catalogChoices(items, 'vinho').map((i) => i.id)).toEqual(['cat-1']);
    expect(catalogChoices(items, 'abridor de vino').map((i) => i.id)).toEqual([
      'cat-1',
    ]);
  });

  it('lists the items ready to order first', () => {
    expect(catalogChoices([...items].reverse(), '').map((i) => i.id)).toEqual([
      'cat-1',
      'cat-2',
    ]);
  });
});
