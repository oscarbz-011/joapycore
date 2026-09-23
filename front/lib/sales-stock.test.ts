import { describe, expect, it } from 'vitest';
import { findStockIssues } from './sales-stock';

describe('findStockIssues', () => {
  it('aggregates duplicate product lines before comparing them with available stock', () => {
    // Mutation caught: changing the shared check to compare each line in
    // isolation would accept 2 + 2 units when only 3 are available.
    expect(
      findStockIssues(
        [
          { productId: 'product-1', quantity: 2 },
          { productId: 'product-1', quantity: 2 },
        ],
        [{ id: 'product-1', name: 'Heladera Samsung', stock: 3 }],
      ),
    ).toEqual(['Heladera Samsung: disponible 3, solicitado 4']);
  });
});
