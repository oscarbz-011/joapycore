import { describe, expect, it } from 'vitest';
import type { Product, ProductStatus } from './api/inventory';
import {
  catalogKpis,
  defaultSalesChannels,
  salesChannelProductFilters,
} from './product-catalog';

function product(id: string, status: ProductStatus): Product {
  return {
    id,
    name: `Producto ${id}`,
    model: null,
    description: null,
    isSerialized: false,
    usesLots: false,
    unit: 'UN',
    weightKg: null,
    heightCm: null,
    widthCm: null,
    depthCm: null,
    costPrice: null,
    salePrice: null,
    additionalMarkup: null,
    additionalMarkupType: null,
    status,
    kind: 'RESALE',
    isPurchasable: true,
    salesChannels: ['NORMAL'],
    deletedAt: null,
    category: null,
    brand: null,
  };
}

describe('product catalog', () => {
  it('counts the complete catalog by every product status', () => {
    expect(
      catalogKpis([
        product('1', 'ACTIVE'),
        product('2', 'ACTIVE'),
        product('3', 'DRAFT'),
        product('4', 'INACTIVE'),
        product('5', 'BLOCKED'),
      ]),
    ).toEqual({
      total: 5,
      active: 2,
      draft: 1,
      inactive: 1,
      blocked: 1,
    });
  });

  it('defaults resale and manufactured products to NORMAL only', () => {
    expect(defaultSalesChannels('RESALE')).toEqual(['NORMAL']);
    expect(defaultSalesChannels('MANUFACTURED')).toEqual(['NORMAL']);
    expect(defaultSalesChannels('RESALE')).not.toBe(
      defaultSalesChannels('RESALE'),
    );
  });

  it('defaults raw materials to no sales channel', () => {
    expect(defaultSalesChannels('RAW_MATERIAL')).toEqual([]);
  });

  it('isolates normal Sales and POS product filters', () => {
    expect(salesChannelProductFilters('NORMAL')).toEqual({
      status: 'ACTIVE',
      salesChannel: 'NORMAL',
    });
    expect(salesChannelProductFilters('POS')).toEqual({
      status: 'ACTIVE',
      salesChannel: 'POS',
    });
  });
});
