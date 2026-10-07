import { describe, expect, it } from 'vitest';
import {
  cancelReasonError,
  historyEntryLabel,
  orderActions,
  orderEmailError,
  confirmDeliveryError,
  orderCalendarDay,
} from './purchase-order-status';

describe('orderActions', () => {
  it('lets a draft be sent, confirmed or cancelled', () => {
    expect(orderActions('PENDING')).toEqual({
      send: true,
      confirm: true,
      cancel: true,
      receive: false,
      delivery: true,
    });
  });

  it('waits for the supplier once the order is sent', () => {
    expect(orderActions('SENT')).toEqual({
      send: false,
      confirm: true,
      cancel: true,
      receive: false,
      delivery: true,
    });
  });

  it('receives goods only on a confirmed order', () => {
    expect(orderActions('CONFIRMED')).toEqual({
      send: false,
      confirm: false,
      cancel: true,
      receive: true,
      delivery: true,
    });
  });

  // Con mercadería recibida ya hay stock y una cuenta por pagar.
  it('cannot cancel once goods were received', () => {
    expect(orderActions('PARTIALLY_RECEIVED')).toEqual({
      send: false,
      confirm: false,
      cancel: false,
      receive: true,
      delivery: true,
    });
  });

  it.each(['RECEIVED', 'CANCELLED'] as const)('offers nothing on %s', (status) => {
    expect(Object.values(orderActions(status))).toEqual([
      false,
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

describe('orderEmailError', () => {
  it('needs an address when the supplier has none', () => {
    expect(orderEmailError('  ')).toContain('dirección');
  });

  it('rejects something that is not an email', () => {
    expect(orderEmailError('roman@mail')).toContain('no es válida');
    expect(orderEmailError('roman mail.com')).toContain('no es válida');
  });

  it('accepts an address, ignoring the spaces around it', () => {
    expect(orderEmailError(' roman@mail.com ')).toBeNull();
  });
});

// La entrega que confirma el proveedor: control interno, no va al PDF.
describe('delivery date on confirmation', () => {
  const ORDER_DATE = '2026-10-06T00:00:00.000Z';

  it('reads the calendar day the order keeps in UTC', () => {
    expect(orderCalendarDay(ORDER_DATE)).toBe('2026-10-06');
    expect(orderCalendarDay(null)).toBe('');
  });

  it('is optional: the order can be confirmed without touching the date', () => {
    expect(confirmDeliveryError('', ORDER_DATE)).toBeNull();
  });

  it('accepts the day of the order and later, not before', () => {
    expect(confirmDeliveryError('2026-10-06', ORDER_DATE)).toBeNull();
    expect(confirmDeliveryError('2026-10-20', ORDER_DATE)).toBeNull();
    expect(confirmDeliveryError('2026-10-05', ORDER_DATE)).toMatch(
      /anterior a la fecha de la orden/,
    );
  });
});

// El proveedor puede reprogramar una entrega ya confirmada.
describe('changing the expected delivery', () => {
  it('is offered while the order still waits for goods', () => {
    for (const status of ['PENDING', 'SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] as const) {
      expect(orderActions(status).delivery).toBe(true);
    }
  });

  it('is not offered once received or cancelled', () => {
    expect(orderActions('RECEIVED').delivery).toBe(false);
    expect(orderActions('CANCELLED').delivery).toBe(false);
  });
});
