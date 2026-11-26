import type Decimal from 'decimal.js';
import { formatQty, qty, sumQty } from '@/lib/quantity';

export interface StockRequestedLine {
  productId: string;
  quantity: number;
}

export interface StockProduct {
  id: string;
  name: string;
  stock: number;
}

export function findStockIssues(
  items: readonly StockRequestedLine[],
  products: readonly StockProduct[],
): string[] {
  const requestedByProduct = items.reduce((totals, item) => {
    if (item.productId) {
      totals.set(item.productId, sumQty([totals.get(item.productId) ?? 0, item.quantity]));
    }
    return totals;
  }, new Map<string, Decimal>());

  return [...requestedByProduct.entries()]
    .map(([productId, requested]) => {
      const product = products.find((candidate) => candidate.id === productId);
      return product && requested.gt(qty(product.stock))
        ? `${product.name}: disponible ${formatQty(product.stock)}, solicitado ${formatQty(requested)}`
        : null;
    })
    .filter((issue): issue is string => issue !== null);
}
