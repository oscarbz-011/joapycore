import {
  DEFAULT_RATING_DELAY_THRESHOLDS,
  averageDelayDays,
  installmentDelayDays,
  scoreFromAverageDelay,
} from './credit-score';

const today = new Date('2026-10-01T15:00:00Z');
const due = new Date('2026-09-05T00:00:00Z');

describe('installmentDelayDays', () => {
  it('is zero for an installment paid on or before its due date', () => {
    expect(
      installmentDelayDays(
        {
          dueDate: due,
          paidAt: new Date('2026-09-05T20:00:00Z'),
          status: 'PAID',
        },
        today,
      ),
    ).toBe(0);
    expect(
      installmentDelayDays(
        {
          dueDate: due,
          paidAt: new Date('2026-09-01T00:00:00Z'),
          status: 'PAID',
        },
        today,
      ),
    ).toBe(0);
  });

  it('does not count a payment made late at night on the due date in Paraguay', () => {
    // 05/09 22:30 en Asunción ya es 06/09 en UTC.
    expect(
      installmentDelayDays(
        {
          dueDate: due,
          paidAt: new Date('2026-09-06T01:30:00Z'),
          status: 'PAID',
        },
        today,
      ),
    ).toBe(0);
  });

  it('keeps a payment date entered as a calendar day on that day', () => {
    expect(
      installmentDelayDays(
        {
          dueDate: due,
          paidAt: new Date('2026-09-06T00:00:00Z'),
          status: 'PAID',
        },
        today,
      ),
    ).toBe(1);
  });

  it('counts the days between the due date and the payment', () => {
    expect(
      installmentDelayDays(
        {
          dueDate: due,
          paidAt: new Date('2026-09-12T10:00:00Z'),
          status: 'PAID',
        },
        today,
      ),
    ).toBe(7);
  });

  it('counts an unpaid overdue installment up to today', () => {
    expect(
      installmentDelayDays(
        { dueDate: due, paidAt: null, status: 'OVERDUE' },
        today,
      ),
    ).toBe(26);
    expect(
      installmentDelayDays(
        { dueDate: due, paidAt: null, status: 'PARTIAL' },
        today,
      ),
    ).toBe(26);
  });

  it('cannot evaluate an unpaid installment that is not due yet', () => {
    expect(
      installmentDelayDays(
        {
          dueDate: new Date('2026-10-05T00:00:00Z'),
          paidAt: null,
          status: 'PENDING',
        },
        today,
      ),
    ).toBeNull();
    expect(
      installmentDelayDays(
        {
          dueDate: new Date('2026-10-01T00:00:00Z'),
          paidAt: null,
          status: 'PENDING',
        },
        today,
      ),
    ).toBeNull();
  });
});

describe('averageDelayDays', () => {
  it('is null without evaluable installments', () => {
    expect(averageDelayDays([])).toBeNull();
  });

  it('averages on-time installments as zero, rounded to one decimal', () => {
    expect(averageDelayDays([0, 0, 10])).toBe(3.3);
  });
});

describe('scoreFromAverageDelay', () => {
  const thresholds = DEFAULT_RATING_DELAY_THRESHOLDS;

  it.each([
    [0, 1],
    [0.1, 2],
    [5, 2],
    [5.1, 3],
    [15, 3],
    [30, 4],
    [30.1, 5],
    [200, 5],
  ])('rates an average of %s days as level %s', (average, score) => {
    expect(scoreFromAverageDelay(average, thresholds)).toBe(score);
  });

  it('follows the thresholds configured by the tenant', () => {
    expect(scoreFromAverageDelay(8, [3, 10, 20, 40])).toBe(2);
  });
});
