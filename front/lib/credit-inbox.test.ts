import { describe, expect, it } from 'vitest';
import { isNewRequest, sortPendingRequests } from './credit-inbox';

const request = (id: string, orderDate: string, creditViewedAt: string | null = null) => ({
  id,
  orderDate,
  creditViewedAt,
});

describe('sortPendingRequests', () => {
  it('lists the newest requests first', () => {
    const sorted = sortPendingRequests([
      request('sept-16', '2026-09-16T22:24:00.000Z'),
      request('oct-03', '2026-10-03T17:17:00.000Z'),
      request('sept-18', '2026-09-18T13:35:00.000Z'),
    ]);

    expect(sorted.map((order) => order.id)).toEqual(['oct-03', 'sept-18', 'sept-16']);
  });

  it('keeps unreviewed requests above reviewed ones, even if older', () => {
    const sorted = sortPendingRequests([
      request('reviewed-recent', '2026-10-03T17:17:00.000Z', '2026-10-03T18:00:00.000Z'),
      request('new-old', '2026-09-16T22:24:00.000Z'),
    ]);

    expect(sorted.map((order) => order.id)).toEqual(['new-old', 'reviewed-recent']);
  });

  it('does not change the original list', () => {
    const orders = [request('a', '2026-09-01T00:00:00.000Z'), request('b', '2026-10-01T00:00:00.000Z')];
    sortPendingRequests(orders);
    expect(orders.map((order) => order.id)).toEqual(['a', 'b']);
  });
});

describe('isNewRequest', () => {
  it('is new until an analyst opens it', () => {
    expect(isNewRequest(request('a', '2026-10-01T00:00:00.000Z'))).toBe(true);
    expect(isNewRequest(request('a', '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z'))).toBe(false);
  });
});
