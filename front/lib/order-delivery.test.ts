import { describe, expect, it } from 'vitest';
import { canDeliverDirectly } from './order-delivery';

const canUpdate = ['sales:read', 'sales:update'];

describe('canDeliverDirectly', () => {
  it.each(['CONFIRMED', 'INVOICED', 'PAYMENT_RECEIVED'] as const)(
    'lets Sales mark a %s order as delivered',
    (status) => {
      expect(canDeliverDirectly({ status, permissions: canUpdate })).toBe(true);
    },
  );

  it.each(['PENDING', 'PENDING_CREDIT_APPROVAL', 'DELIVERED', 'CANCELLED', 'QUOTED'] as const)(
    'offers nothing for a %s order',
    (status) => {
      expect(canDeliverDirectly({ status, permissions: canUpdate })).toBe(false);
    },
  );

  it('requires permission to update sales', () => {
    expect(canDeliverDirectly({ status: 'INVOICED', permissions: ['sales:read'] })).toBe(false);
  });
});
