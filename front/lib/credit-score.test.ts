import { describe, expect, it } from 'vitest';
import type { CreditHistory, LoanSummary } from './api/sales';
import {
  formatDelay,
  historyTotals,
  ratingRanges,
  scoreLabel,
  scoreStyle,
  thresholdsError,
} from './credit-score';

describe('scoreLabel', () => {
  it('names every level and the customers without history', () => {
    expect(scoreLabel(1)).toBe('1 · Excelente');
    expect(scoreLabel(5)).toBe('5 · Muy riesgoso');
    expect(scoreLabel(6)).toBe('6 · Incobrable / Judicial');
    expect(scoreLabel(null)).toBe('Sin historial');
  });

  it('styles level 6 differently from level 5 and from no history', () => {
    expect(new Set([scoreStyle(5), scoreStyle(6), scoreStyle(null)]).size).toBe(
      3,
    );
  });
});

describe('formatDelay', () => {
  it('distinguishes no data, on time and late', () => {
    expect(formatDelay(null)).toBe('—');
    expect(formatDelay(0)).toBe('Al día');
    expect(formatDelay(1)).toBe('1 día');
    expect(formatDelay(12)).toBe('12 días');
  });

  it('shows one decimal with a comma for averages', () => {
    expect(formatDelay(3.3)).toBe('3,3 días');
  });
});

describe('ratingRanges', () => {
  it('describes the five levels from the four limits', () => {
    expect(ratingRanges([0, 5, 15, 30])).toEqual([
      'Sin atraso',
      'Más de 0 y hasta 5 días',
      'Más de 5 y hasta 15 días',
      'Más de 15 y hasta 30 días',
      'Más de 30 días',
    ]);
  });

  it('allows a tolerance in the best level', () => {
    expect(ratingRanges([3, 10, 20, 40])[0]).toBe('Hasta 3 días');
  });
});

describe('thresholdsError', () => {
  it('accepts strictly increasing whole days', () => {
    expect(thresholdsError([0, 5, 15, 30])).toBeNull();
  });

  it('rejects limits that do not increase', () => {
    expect(thresholdsError([0, 10, 10, 30])).toMatch('más días de atraso');
    expect(thresholdsError([5, 3, 15, 30])).toMatch('más días de atraso');
  });

  it('rejects negative or fractional days', () => {
    expect(thresholdsError([-1, 5, 15, 30])).toMatch('número entero');
    expect(thresholdsError([0, 5.5, 15, 30])).toMatch('número entero');
    expect(thresholdsError([0, 5, NaN, 30])).toMatch('número entero');
  });
});

describe('historyTotals', () => {
  const loan = (overrides: Partial<LoanSummary>) =>
    ({
      outstandingBalance: 0,
      lateInstallments: 0,
      maxDelayDays: 0,
      ...overrides,
    }) as LoanSummary;

  it('adds what is owed on active loans and the delays of every loan', () => {
    const history = {
      activeLoans: [
        loan({ outstandingBalance: 312_000, lateInstallments: 1, maxDelayDays: 21 }),
        loan({ outstandingBalance: 351_000, lateInstallments: 1, maxDelayDays: 9 }),
      ],
      finishedLoans: [loan({ lateInstallments: 3, maxDelayDays: 40 })],
    } as CreditHistory;

    expect(historyTotals(history)).toEqual({
      activeCount: 2,
      finishedCount: 1,
      outstanding: 663_000,
      lateInstallments: 5,
      maxDelayDays: 40,
    });
  });

  it('is all zeros for a customer without loans', () => {
    expect(
      historyTotals({ activeLoans: [], finishedLoans: [] } as unknown as CreditHistory),
    ).toEqual({
      activeCount: 0,
      finishedCount: 0,
      outstanding: 0,
      lateInstallments: 0,
      maxDelayDays: 0,
    });
  });
});
