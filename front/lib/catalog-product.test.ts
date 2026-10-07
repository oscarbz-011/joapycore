import { describe, expect, it } from 'vitest';
import type { SupplierCatalogItem } from './api/procurement';
import {
  catalogProductError,
  catalogProductFormFrom,
  catalogUnitCost,
  toCatalogProductPayload,
} from './catalog-product';

function item(overrides: Partial<SupplierCatalogItem> = {}): SupplierCatalogItem {
  return {
    id: 'item-1',
    supplierId: 'sup-1',
    supplierSku: '332726',
    description: 'ABRIDOR DE VINHO SMARTFY AV01B 10W BLACK',
    price: 54_000,
    supplierUnit: null,
    conversionFactor: null,
    validFrom: null,
    validTo: null,
    productId: null,
    product: null,
    ...overrides,
  };
}

describe('catalogUnitCost', () => {
  it('uses the list price when the supplier sells by the unit', () => {
    expect(catalogUnitCost(item())).toBe(54_000);
    expect(catalogUnitCost(item({ conversionFactor: 1 }))).toBe(54_000);
  });

  it('splits the price of a pack into its units', () => {
    expect(
      catalogUnitCost(item({ price: 120_000, conversionFactor: 12 })),
    ).toBe(10_000);
    expect(catalogUnitCost(item({ price: 100, conversionFactor: 3 }))).toBe(
      33.33,
    );
  });

  it('has no cost without a list price', () => {
    expect(catalogUnitCost(item({ price: null }))).toBe(0);
  });
});

describe('catalogProductFormFrom', () => {
  it('starts from the supplier description and unit cost', () => {
    expect(
      catalogProductFormFrom(item({ price: 120_000, conversionFactor: 12 })),
    ).toEqual({
      name: 'ABRIDOR DE VINHO SMARTFY AV01B 10W BLACK',
      categoryId: '',
      brandId: '',
      unit: 'unidad',
      costPrice: 10_000,
      salePrice: 0,
      isSerialized: false,
    });
  });
});

describe('catalogProductError', () => {
  const valid = {
    ...catalogProductFormFrom(item()),
    categoryId: 'cat-1',
    salePrice: 80_000,
  };

  it('accepts a complete form', () => {
    expect(catalogProductError(valid)).toBeNull();
  });

  // Sin estos cuatro el producto quedaría en borrador y no se podría comprar.
  it.each([
    [{ name: '  ' }, 'nombre'],
    [{ categoryId: '' }, 'categoría'],
    [{ costPrice: 0 }, 'costo'],
    [{ salePrice: 0 }, 'venta'],
  ])('asks for what is missing: %o', (patch, word) => {
    expect(catalogProductError({ ...valid, ...patch })).toContain(word);
  });
});

describe('toCatalogProductPayload', () => {
  it('creates the product on hold for sale until its first receipt', () => {
    const payload = toCatalogProductPayload({
      ...catalogProductFormFrom(item()),
      name: '  Abridor de vino  ',
      categoryId: 'cat-1',
      brandId: 'brand-1',
      unit: ' ',
      salePrice: 80_000,
    });

    expect(payload).toEqual({
      name: 'Abridor de vino',
      categoryId: 'cat-1',
      brandId: 'brand-1',
      unit: 'unidad',
      costPrice: 54_000,
      salePrice: 80_000,
      isSerialized: false,
      isPurchasable: true,
      sellOnFirstReceipt: true,
    });
  });

  it('leaves the brand out when none was chosen', () => {
    const payload = toCatalogProductPayload({
      ...catalogProductFormFrom(item()),
      categoryId: 'cat-1',
      salePrice: 80_000,
    });

    expect(payload).not.toHaveProperty('brandId');
  });
});
