import { describe, expect, it } from 'vitest';
import { WS_EVENT_MAP } from './ws-event-map';

describe('WS_EVENT_MAP stock events', () => {
  it.each(['stock.movement.created', 'sale.order.stock_out'])(
    '%s refreshes the inventory screens',
    (event) => {
      expect(WS_EVENT_MAP[event]).toEqual(
        expect.arrayContaining([
          ['inventory-stock'],
          ['inventory-products'],
          ['inventory-product'],
          ['inventory-movements'],
          ['inventory-product-units'],
          ['product-batches'],
        ]),
      );
    },
  );
});
