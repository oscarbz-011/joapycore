import { describe, expect, it } from 'vitest';
import type { Installment } from './api/finance';
import {
  isOverdue,
  isPayable,
  loanSummary,
  selectAll,
  selectByAmount,
  selectionTotal,
  selectOverdue,
  toggle,
} from './receivable-collect';

// Mediodía en Paraguay del 12/10/2026.
const NOW = new Date('2026-10-12T15:00:00.000Z');

const inst = (number: number, dueDate: string, overrides: Partial<Installment> = {}): Installment => ({
  id: `i${number}`,
  loanId: 'loan-1',
  number,
  dueDate: `${dueDate}T00:00:00.000Z`,
  amount: 100,
  paidAmount: 0,
  paidAt: null,
  paymentDate: null,
  status: 'PENDING',
  notes: null,
  ...overrides,
});

const charge = (amount: number) =>
  [{ id: `c${amount}`, amount, component: { name: 'Interés moratorio' } }] as Installment['interestCharges'];

// 1 pagada, 2 vencidas (una con recargo y un pago parcial), 2 por vencer.
const plan = [
  inst(1, '2026-07-05', { status: 'PAID', paidAmount: 100 }),
  inst(2, '2026-08-05', { status: 'PARTIAL', paidAmount: 40, interestCharges: charge(15) }),
  inst(3, '2026-09-05', { interestCharges: charge(5) }),
  inst(4, '2026-10-12'),
  inst(5, '2026-11-05'),
];

describe('which installments can be collected', () => {
  it('leaves out what is already paid', () => {
    expect(plan.filter(isPayable).map((i) => i.number)).toEqual([2, 3, 4, 5]);
  });

  // La que vence hoy todavía está en término.
  it('counts as overdue only what was due before today', () => {
    expect(plan.filter((i) => isOverdue(i, NOW)).map((i) => i.number)).toEqual([2, 3]);
  });
});

describe('loanSummary', () => {
  const summary = loanSummary(plan, NOW);

  it('separates what was paid, the balance and the charges', () => {
    expect(summary.paid).toBe(140);
    expect(summary.principal).toBe(360);
    expect(summary.charges).toBe(20);
    expect(summary.owedToday).toBe(380);
  });

  it('adds up the overdue installments with their charges', () => {
    expect(summary.overdueCount).toBe(2);
    expect(summary.overdue).toBe(60 + 15 + 100 + 5);
  });

  it('points at the oldest unpaid installment', () => {
    expect(summary.nextDue?.number).toBe(2);
  });

  it('is all zeros for a settled loan', () => {
    const settled = loanSummary([inst(1, '2026-07-05', { status: 'PAID', paidAmount: 100 })], NOW);
    expect(settled).toMatchObject({ owedToday: 0, overdueCount: 0, overdue: 0, nextDue: null });
  });
});

describe('choosing what to collect', () => {
  it('picks everything overdue, each for its full balance with charges', () => {
    expect(selectOverdue(plan, NOW)).toEqual({ i2: 75, i3: 105 });
  });

  it('picks everything still owed', () => {
    expect(selectAll(plan)).toEqual({ i2: 75, i3: 105, i4: 100, i5: 100 });
  });

  it('covers the oldest installments an amount reaches, the last one partially', () => {
    expect(selectByAmount(plan, 120)).toEqual({
      selection: { i2: 75, i3: 45 },
      leftover: 0,
      lastIsPartial: true,
    });
  });

  it('says what is left over when the amount exceeds the debt', () => {
    expect(selectByAmount(plan, 400)).toMatchObject({ leftover: 20, lastIsPartial: false });
  });

  it('adds an installment for its full balance and takes it back out', () => {
    const added = toggle({}, plan[2]);
    expect(added).toEqual({ i3: 105 });
    expect(toggle(added, plan[2])).toEqual({});
  });

  it('totals the selection', () => {
    expect(selectionTotal({ i2: 75, i3: 45 })).toBe(120);
    expect(selectionTotal({})).toBe(0);
  });
});
