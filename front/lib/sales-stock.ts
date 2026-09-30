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
      totals.set(
        item.productId,
        (totals.get(item.productId) ?? 0) + item.quantity,
      );
    }
    return totals;
  }, new Map<string, number>());

  return [...requestedByProduct.entries()]
    .map(([productId, requested]) => {
      const product = products.find((candidate) => candidate.id === productId);
      return product && requested > product.stock
        ? `${product.name}: disponible ${product.stock}, solicitado ${requested}`
        : null;
    })
    .filter((issue): issue is string => issue !== null);
}
