import {
  advanceBalance,
  advanceToApply,
  payableStatusAfterAdvance,
  requiredAdvance,
} from './advance.util';

describe('requiredAdvance', () => {
  it('uses the amount set on the order when there is one', () => {
    expect(requiredAdvance(1_000_000, { amount: 300_000, percent: 50 })).toBe(
      300_000,
    );
  });

  it('falls back to the percentage the supplier asks for', () => {
    expect(requiredAdvance(1_000_000, { percent: 30 })).toBe(300_000);
    expect(requiredAdvance(333_333, { percent: 50 })).toBe(166_666.5);
  });

  it('asks for nothing when the supplier requires no advance', () => {
    expect(requiredAdvance(1_000_000, {})).toBe(0);
    expect(requiredAdvance(1_000_000, { percent: null })).toBe(0);
  });

  // "Pago total": un proveedor nuevo puede pedir el 100% antes de enviar.
  it('allows the whole order up front', () => {
    expect(requiredAdvance(1_000_000, { percent: 100 })).toBe(1_000_000);
  });
});

describe('advanceBalance', () => {
  const payment = (kind: string, amount: number) => ({ kind, amount });

  it('adds up what was paid in advance', () => {
    expect(
      advanceBalance({
        required: 500_000,
        payments: [payment('ADVANCE', 200_000), payment('ADVANCE', 100_000)],
        applied: 0,
      }),
    ).toEqual({
      required: 500_000,
      paid: 300_000,
      refunded: 0,
      applied: 0,
      available: 300_000,
      pending: 200_000,
    });
  });

  // Lo aplicado ya se descontó de una cuenta por pagar: no está disponible ni
  // se puede devolver.
  it('takes out what was already applied to received goods and what was refunded', () => {
    const balance = advanceBalance({
      required: 500_000,
      payments: [
        payment('ADVANCE', 500_000),
        payment('ADVANCE_REFUND', 100_000),
      ],
      applied: 250_000,
    });

    expect(balance.available).toBe(150_000);
    expect(balance.pending).toBe(100_000);
  });

  it('never reports a negative pending amount when more than required was paid', () => {
    expect(
      advanceBalance({
        required: 100_000,
        payments: [payment('ADVANCE', 150_000)],
        applied: 0,
      }).pending,
    ).toBe(0);
  });

  it('ignores ordinary payments of a payable', () => {
    expect(
      advanceBalance({
        required: 0,
        payments: [payment('PAYMENT', 999)],
        applied: 0,
      }).paid,
    ).toBe(0);
  });

  it('reads the decimals the database returns', () => {
    expect(
      advanceBalance({
        required: '500000.00',
        payments: [{ kind: 'ADVANCE', amount: '200000.50' }],
        applied: '0',
      }).paid,
    ).toBe(200_000.5);
  });
});

describe('applying the advance to a payable', () => {
  it('covers the payable up to what is available', () => {
    expect(advanceToApply(300_000, 1_000_000)).toBe(300_000);
    expect(advanceToApply(300_000, 200_000)).toBe(200_000);
    expect(advanceToApply(0, 200_000)).toBe(0);
  });

  it('leaves the payable pending, partial or paid', () => {
    expect(payableStatusAfterAdvance(0, 200_000)).toBe('PENDING');
    expect(payableStatusAfterAdvance(50_000, 200_000)).toBe('PARTIAL');
    expect(payableStatusAfterAdvance(200_000, 200_000)).toBe('PAID');
  });
});
