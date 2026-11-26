import { describe, expect, it } from 'vitest';
import {
  lineStockQuantity,
  saleUnitPayload,
  savedSaleUnit,
} from '@/components/sales/order-line-items';

describe('sale line unit', () => {
  it('takes from stock quantity × factor, 1 by default', () => {
    expect(lineStockQuantity({ quantity: 2, unitFactor: 5.0325 })).toBe(10.065);
    expect(lineStockQuantity({ quantity: 2.375 })).toBe(2.375);
    expect(lineStockQuantity({ quantity: 3, unitFactor: null })).toBe(3);
  });

  it('sends the presentation or the cut, never the factor', () => {
    expect(saleUnitPayload({ saleUnit: { presentationId: 'pp1' } })).toEqual({ presentationId: 'pp1' });
    expect(saleUnitPayload({ saleUnit: { cut: { length: 1.2, width: 0.6 } } })).toEqual({
      cut: { length: 1.2, width: 0.6 },
    });
    expect(saleUnitPayload({})).toEqual({});
  });

  it('brings back how a saved line was sold', () => {
    expect(savedSaleUnit({ presentationId: 'pp1' })).toEqual({ presentationId: 'pp1' });
    expect(savedSaleUnit({ cutLength: '1.2', cutWidth: '0.6', cutHeight: null })).toEqual({
      cut: { length: 1.2, width: 0.6, height: undefined },
    });
    expect(savedSaleUnit({})).toBeUndefined();
  });
});
