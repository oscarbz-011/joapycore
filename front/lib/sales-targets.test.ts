import { describe, expect, it } from 'vitest';
import type { SellerStat } from './api/sales';
import {
  addMonths,
  dailyNeeded,
  fmtGs,
  gap,
  goalStatus,
  monthProgress,
  percentOf,
  periodLabel,
  sellerRows,
  statusCounts,
} from './sales-targets';

// 14 de octubre: van 14 de 31 días.
const OCT_14 = monthProgress('2026-10', '2026-10-14');

describe('the period', () => {
  it('is named in lowercase Spanish', () => {
    expect(periodLabel('2026-10')).toBe('octubre de 2026');
  });

  it('moves across the end of the year', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('knows how much of the month has gone by, today included', () => {
    expect(OCT_14).toEqual({ elapsed: 14, days: 31, left: 18, fraction: 14 / 31 });
  });

  it('counts a past month as over and a future one as not started', () => {
    expect(monthProgress('2026-09', '2026-10-14')).toMatchObject({ elapsed: 30, left: 0, fraction: 1 });
    expect(monthProgress('2026-11', '2026-10-14')).toMatchObject({ elapsed: 0, left: 30, fraction: 0 });
  });
});

describe('percentOf', () => {
  // Antes se cortaba en 100 % y quien vendió de más no se distinguía.
  it('shows going over the goal', () => {
    expect(percentOf(30_400_000, 25_000_000)).toBe(122);
    expect(percentOf(9_550_000, 20_000_000)).toBe(48);
  });

  it('is nothing without a goal', () => {
    expect(percentOf(980_000, null)).toBeNull();
    expect(percentOf(980_000, 0)).toBeNull();
  });
});

describe('goalStatus', () => {
  it('says the goal was met', () => {
    expect(goalStatus(30_400_000, 25_000_000, OCT_14)).toBe('achieved');
  });

  // 48 % del objetivo con 45 % del mes recorrido.
  it('is on track when the sales keep up with the days gone by', () => {
    expect(goalStatus(9_550_000, 20_000_000, OCT_14)).toBe('on-track');
  });

  it('is behind when the sales fall short of the days gone by', () => {
    expect(goalStatus(4_000_000, 20_000_000, OCT_14)).toBe('behind');
  });

  it('allows a small margin before calling it behind', () => {
    expect(goalStatus(8_200_000, 20_000_000, OCT_14)).toBe('on-track');
  });

  it('says the goal was missed once the month is over', () => {
    expect(goalStatus(9_550_000, 20_000_000, monthProgress('2026-09', '2026-10-14'))).toBe('missed');
  });

  it('waits for a month that has not started', () => {
    expect(goalStatus(0, 20_000_000, monthProgress('2026-11', '2026-10-14'))).toBe('upcoming');
  });

  it('has nothing to say without a goal', () => {
    expect(goalStatus(980_000, null, OCT_14)).toBe('none');
  });
});

describe('gap and daily need', () => {
  it('tells what is missing or by how much the goal was beaten', () => {
    expect(gap(9_550_000, 20_000_000)).toEqual({ kind: 'missing', amount: 10_450_000 });
    expect(gap(30_400_000, 25_000_000)).toEqual({ kind: 'exceeded', amount: 5_400_000 });
    expect(gap(1, null)).toBeNull();
  });

  it('divides what is missing among the days left', () => {
    expect(dailyNeeded(9_550_000, 20_000_000, OCT_14)).toBeCloseTo(10_450_000 / 18);
  });

  it('asks for nothing once the goal is met, the month is over or there is no goal', () => {
    expect(dailyNeeded(30_400_000, 25_000_000, OCT_14)).toBeNull();
    expect(dailyNeeded(1, 20_000_000, monthProgress('2026-09', '2026-10-14'))).toBeNull();
    expect(dailyNeeded(1, null, OCT_14)).toBeNull();
  });
});

describe('sellerRows', () => {
  const stat = (firstName: string, actual: number, target: number | null): SellerStat => ({
    seller: { id: firstName, firstName, lastName: 'Test' },
    actual,
    target,
    cashAmount: actual,
    creditAmount: 0,
    cashCount: 1,
    creditCount: 0,
  });

  it('ranks by what was sold and works out where each one stands', () => {
    const rows = sellerRows([stat('Luis', 9_550_000, 20_000_000), stat('Ana', 30_400_000, 25_000_000), stat('Carla', 980_000, null)], OCT_14);

    expect(rows.map((row) => [row.rank, row.name, row.percent, row.status, row.remaining])).toEqual([
      [1, 'Ana Test', 122, 'achieved', -5_400_000],
      [2, 'Luis Test', 48, 'on-track', 10_450_000],
      [3, 'Carla Test', null, 'none', null],
    ]);
    expect(statusCounts(rows)).toEqual({ achieved: 1, 'on-track': 1, none: 1 });
  });
});

describe('fmtGs', () => {
  it('writes guaraníes without decimals', () => {
    expect(fmtGs(30_400_000.4)).toBe('Gs. 30.400.000');
  });
});
