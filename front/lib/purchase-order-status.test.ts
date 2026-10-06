import { describe, expect, it } from 'vitest';
import {
  cancelReasonError,
  historyEntryLabel,
  orderActions,
} from './purchase-order-status';

describe('orderActions', () => {
  it('lets a draft be sent, confirmed or cancelled', () => {
    expect(orderActions('PENDING')).toEqual({
      send: true,
      confirm: true,
      cancel: true,
      receive: false,
    });
  });

  it('waits for the supplier once the order is sent', () => {
    expect(orderActions('SENT')).toEqual({
      send: false,
      confirm: true,
      cancel: true,
      receive: false,
    });
  });

  it('receives goods only on a confirmed order', () => {
    expect(orderActions('CONFIRMED')).toEqual({
      send: false,
      confirm: false,
      cancel: true,
      receive: true,
    });
  });

  // Con mercadería recibida ya hay stock y una cuenta por pagar.
  it('cannot cancel once goods were received', () => {
    expect(orderActions('PARTIALLY_RECEIVED')).toEqual({
      send: false,
      confirm: false,
      cancel: false,
      receive: true,
    });
  });

  it.each(['RECEIVED', 'CANCELLED'] as const)('offers nothing on %s', (status) => {
    expect(Object.values(orderActions(status))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('historyEntryLabel', () => {
  it.each([
    [null, 'PENDING', 'Orden creada'],
    ['PENDING', 'SENT', 'Enviada al proveedor'],
    ['SENT', 'CONFIRMED', 'Confirmada por el proveedor'],
    ['CONFIRMED', 'PARTIALLY_RECEIVED', 'Recepción parcial de mercadería'],
    ['PARTIALLY_RECEIVED', 'RECEIVED', 'Mercadería recibida por completo'],
    ['CONFIRMED', 'CANCELLED', 'Orden cancelada'],
  ] as const)('%s → %s: %s', (fromStatus, toStatus, label) => {
    expect(historyEntryLabel({ fromStatus, toStatus })).toBe(label);
  });
});

describe('cancelReasonError', () => {
  it('asks for a reason', () => {
    expect(cancelReasonError('  ')).toContain('motivo');
    expect(cancelReasonError('no')).toContain('motivo');
  });

  it('accepts a real reason', () => {
    expect(cancelReasonError('El proveedor no tiene stock')).toBeNull();
  });
});
