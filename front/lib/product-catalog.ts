import type {
  OrderChannel,
  Product,
  ProductFilters,
  ProductKind,
} from './api/inventory';

export interface CatalogKpis {
  total: number;
  active: number;
  draft: number;
  inactive: number;
  blocked: number;
}

export function catalogKpis(products: readonly Product[]): CatalogKpis {
  return products.reduce<CatalogKpis>(
    (counts, product) => {
      counts.total += 1;
      if (product.status === 'ACTIVE') counts.active += 1;
      if (product.status === 'DRAFT') counts.draft += 1;
      if (product.status === 'INACTIVE') counts.inactive += 1;
      if (product.status === 'BLOCKED') counts.blocked += 1;
      return counts;
    },
    { total: 0, active: 0, draft: 0, inactive: 0, blocked: 0 },
  );
}

export function defaultSalesChannels(kind: ProductKind): OrderChannel[] {
  return kind === 'RAW_MATERIAL' ? [] : ['NORMAL'];
}

export function salesChannelProductFilters(
  channel: Extract<OrderChannel, 'NORMAL' | 'POS'>,
): ProductFilters {
  return { status: 'ACTIVE', salesChannel: channel };
}
