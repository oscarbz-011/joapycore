import { describe, expect, it } from 'vitest';
import {
  advanceDraftError,
  advanceFromPercent,
  advanceMovementError,
  advancePercentLabel,
  advanceRoom,
  advanceState,
  cancelAdvanceBlock,
  percentOfTotal,
  receiveAdvanceWarning,
  requiredAdvanceError,
  resolveAdvanceDraft,
  suggestedMovementAmount,
  supplierAdvanceDraft,
  type OrderAdvance,
} from './advance';

const advance = (overrides: Partial<OrderAdvance> = {}): OrderAdvance => ({
  required: 0,
  paid: 0,
  refunded: 0,
  applied: 0,
  available: 0,
  pending: 0,
  ...overrides,
});

describe('percentage and amount of an advance', () => {
  it('turns the percentage into guaraníes of the order', () => {
    expect(advanceFromPercent(1_000_000, 30)).toBe(300_000);
    expect(advanceFromPercent(333_333, 50)).toBe(166_667);
    expect(advanceFromPercent(1_000_000, 100)).toBe(1_000_000);
  });

  it('turns the amount back into a percentage', () => {
    expect(percentOfTotal(1_000_000, 300_000)).toBe(30);
    expect(percentOfTotal(3_000_000, 1_000_000)).toBe(33.33);
  });

  it('is zero while the order has no lines', () => {
    expect(advanceFromPercent(0, 30)).toBe(0);
    expect(percentOfTotal(0, 300_000)).toBe(0);
  });

  it('describes what the supplier usually asks for', () => {
    expect(advancePercentLabel(null)).toBe('No pide');
    expect(advancePercentLabel(0)).toBe('No pide');
    expect(advancePercentLabel(30)).toBe('30% de la orden');
    expect(advancePercentLabel(100)).toBe('Pago total por adelantado');
  });
});

describe('requiredAdvanceError', () => {
  it('accepts none and up to the whole order', () => {
    expect(requiredAdvanceError(0, 1_000_000)).toBeNull();
    expect(requiredAdvanceError(1_000_000, 1_000_000)).toBeNull();
  });

  it('rejects more than the order or a negative amount', () => {
    expect(requiredAdvanceError(1_000_001, 1_000_000)).toMatch(/superar/);
    expect(requiredAdvanceError(-1, 1_000_000)).toMatch(/negativo/);
  });
});

describe('advance movements', () => {
  const partlyPaid = advance({
    required: 500_000,
    paid: 200_000,
    available: 200_000,
    pending: 300_000,
  });

  it('proposes what is still pending, or what was left in favour to refund', () => {
    expect(suggestedMovementAmount('ADVANCE', partlyPaid, 1_000_000)).toBe(300_000);
    expect(suggestedMovementAmount('ADVANCE_REFUND', partlyPaid, 1_000_000)).toBe(
      200_000,
    );
  });

  it('proposes the rest of the order when nothing specific is pending', () => {
    expect(suggestedMovementAmount('ADVANCE', advance(), 1_000_000)).toBe(1_000_000);
  });

  it('counts refunds when measuring how much more can be advanced', () => {
    expect(
      advanceRoom(advance({ paid: 900_000, refunded: 100_000 }), 1_000_000),
    ).toBe(200_000);
  });

  it('does not advance more than the order', () => {
    expect(advanceMovementError('ADVANCE', 800_000, partlyPaid, 1_000_000)).toBeNull();
    expect(advanceMovementError('ADVANCE', 800_001, partlyPaid, 1_000_000)).toMatch(
      /quedan Gs\. 800\.000/,
    );
  });

  // Lo aplicado a mercadería recibida ya no es plata que el proveedor deba.
  it('does not refund more than the balance in favour', () => {
    const applied = advance({ paid: 300_000, applied: 250_000, available: 50_000 });
    expect(advanceMovementError('ADVANCE_REFUND', 50_000, applied, 1_000_000)).toBeNull();
    expect(advanceMovementError('ADVANCE_REFUND', 50_001, applied, 1_000_000)).toMatch(
      /saldo a favor/,
    );
  });

  it('asks for an amount', () => {
    expect(advanceMovementError('ADVANCE', 0, partlyPaid, 1_000_000)).toMatch(
      /mayor a cero/,
    );
  });
});

describe('advanceState', () => {
  it('tells none, pending, partial and covered apart', () => {
    expect(advanceState(advance())).toBe('none');
    expect(advanceState(advance({ required: 500_000, pending: 500_000 }))).toBe(
      'pending',
    );
    expect(
      advanceState(advance({ required: 500_000, paid: 200_000, pending: 300_000 })),
    ).toBe('partial');
    expect(advanceState(advance({ required: 500_000, paid: 500_000 }))).toBe(
      'covered',
    );
  });

  // Se le adelantó plata sin que la orden lo pidiera: no es "sin anticipo".
  it('shows an advance paid on an order that asked for none', () => {
    expect(advanceState(advance({ paid: 100_000, available: 100_000 }))).toBe(
      'covered',
    );
  });
});

describe('warnings', () => {
  it('warns, without blocking, when receiving with the advance unpaid', () => {
    expect(
      receiveAdvanceWarning(advance({ required: 500_000, pending: 300_000 })),
    ).toMatch(/faltan pagar Gs\. 300\.000.*igual/);
    expect(receiveAdvanceWarning(advance({ required: 500_000 }))).toBeNull();
    expect(receiveAdvanceWarning(undefined)).toBeNull();
  });

  it('explains why an order with money advanced cannot be cancelled yet', () => {
    expect(cancelAdvanceBlock(advance({ available: 300_000 }))).toMatch(
      /devolución/,
    );
    expect(cancelAdvanceBlock(advance())).toBeNull();
    expect(cancelAdvanceBlock(undefined)).toBeNull();
  });
});

describe('advance of an order being written', () => {
  it('starts from what the supplier usually asks for', () => {
    expect(supplierAdvanceDraft(30)).toEqual({ mode: 'percent', value: '30' });
    expect(supplierAdvanceDraft(null)).toEqual({ mode: 'percent', value: '' });
  });

  // Como porcentaje acompaña al total mientras se agregan líneas.
  it('follows the total while it is a percentage', () => {
    const draft = supplierAdvanceDraft(30);
    expect(resolveAdvanceDraft(draft, 1_000_000)).toEqual({
      amount: 300_000,
      percent: 30,
    });
    expect(resolveAdvanceDraft(draft, 2_000_000).amount).toBe(600_000);
  });

  it('stays fixed once an amount is typed, and shows what share it is', () => {
    const draft = { mode: 'amount' as const, value: '250000' };
    expect(resolveAdvanceDraft(draft, 1_000_000)).toEqual({
      amount: 250_000,
      percent: 25,
    });
    expect(resolveAdvanceDraft(draft, 2_000_000).amount).toBe(250_000);
  });

  it('asks for nothing when left blank', () => {
    expect(resolveAdvanceDraft({ mode: 'percent', value: '' }, 1_000_000)).toEqual({
      amount: 0,
      percent: 0,
    });
  });

  it('rejects more than the whole order, either way it was typed', () => {
    expect(advanceDraftError({ mode: 'percent', value: '100' }, 1_000_000)).toBeNull();
    expect(advanceDraftError({ mode: 'percent', value: '101' }, 1_000_000)).toMatch(
      /100%/,
    );
    expect(advanceDraftError({ mode: 'amount', value: '1000001' }, 1_000_000)).toMatch(
      /superar/,
    );
  });
});
