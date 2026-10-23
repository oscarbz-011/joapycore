import { describe, expect, it } from 'vitest';
import { orderDeliveryMode } from './order-delivery';

const canUpdate = ['sales:read', 'sales:update'];

describe('orderDeliveryMode', () => {
  it('leaves the delivery to Logistics when the module is active', () => {
    expect(
      orderDeliveryMode({
        status: 'INVOICED',
        logisticsActive: true,
        permissions: canUpdate,
      }),
    ).toBe('logistics');
  });

  it.each(['CONFIRMED', 'INVOICED', 'PAYMENT_RECEIVED'] as const)(
    'lets Sales mark a %s order as delivered without Logistics',
    (status) => {
      expect(
        orderDeliveryMode({ status, logisticsActive: false, permissions: canUpdate }),
      ).toBe('direct');
    },
  );

  it.each(['PENDING', 'PENDING_CREDIT_APPROVAL', 'DELIVERED', 'CANCELLED', 'QUOTED'] as const)(
    'offers nothing for a %s order',
    (status) => {
      expect(
        orderDeliveryMode({ status, logisticsActive: false, permissions: canUpdate }),
      ).toBe('none');
    },
  );

  it('requires permission to update sales', () => {
    expect(
      orderDeliveryMode({
        status: 'INVOICED',
        logisticsActive: false,
        permissions: ['sales:read'],
      }),
    ).toBe('none');
  });
});
