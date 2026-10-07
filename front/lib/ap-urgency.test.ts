import { describe, expect, it } from 'vitest';
import { apUrgency } from './ap-urgency';

const DUE = '2026-10-06T00:00:00.000Z';
const payable = (status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED') => ({
  status,
  dueDate: DUE,
});

describe('apUrgency', () => {
  // 21:14 del 6 en Paraguay, ya 7 en UTC: sigue en fecha.
  it('says a payable due today is due today, not overdue', () => {
    expect(apUrgency(payable('PENDING'), new Date('2026-10-07T00:14:00Z'))).toEqual({
      level: 'due-today',
      days: 0,
    });
  });

  it('is overdue from the day after', () => {
    expect(apUrgency(payable('PARTIAL'), new Date('2026-10-07T15:00:00Z'))).toEqual({
      level: 'overdue',
      days: 1,
    });
  });

  it('is simply pending before the due day or without one', () => {
    expect(apUrgency(payable('PENDING'), new Date('2026-10-05T15:00:00Z')).level).toBe(
      'pending',
    );
    expect(apUrgency({ status: 'PENDING', dueDate: null }).level).toBe('pending');
  });

  it('has no urgency once paid or cancelled', () => {
    const late = new Date('2026-12-01T15:00:00Z');
    expect(apUrgency(payable('PAID'), late).level).toBeNull();
    expect(apUrgency(payable('CANCELLED'), late).level).toBeNull();
  });
});
