import { describe, expect, it } from 'vitest';
import { daysOverdue } from './overdue';

// Vencimiento: día de calendario 06/10/2026, guardado a medianoche UTC.
const DUE = '2026-10-06T00:00:00.000Z';
// Paraguay está en UTC-3: las 21:14 del 6 son las 00:14 UTC del 7.
const at = (utc: string) => new Date(utc);

describe('daysOverdue', () => {
  it('is zero for the whole due day in Paraguay', () => {
    expect(daysOverdue(DUE, at('2026-10-06T03:00:00Z'))).toBe(0); // 00:00 PY
    expect(daysOverdue(DUE, at('2026-10-06T15:00:00Z'))).toBe(0); // 12:00 PY
  });

  // El caso que fallaba: de noche figuraba "vencida · 1 día" estando en fecha.
  it('is still zero late at night, when UTC is already the next day', () => {
    expect(daysOverdue(DUE, at('2026-10-07T00:14:00Z'))).toBe(0); // 21:14 PY
    expect(daysOverdue(DUE, at('2026-10-07T02:59:00Z'))).toBe(0); // 23:59 PY
  });

  it('counts one day once the next day starts in Paraguay', () => {
    expect(daysOverdue(DUE, at('2026-10-07T03:00:00Z'))).toBe(1); // 00:00 PY
    expect(daysOverdue(DUE, at('2026-10-09T15:00:00Z'))).toBe(3);
  });

  it('is negative while the due day has not arrived', () => {
    expect(daysOverdue(DUE, at('2026-10-05T15:00:00Z'))).toBe(-1);
    // 5 de octubre, 22:00 en Paraguay: falta un día aunque en UTC ya sea 6.
    expect(daysOverdue(DUE, at('2026-10-06T01:00:00Z'))).toBe(-1);
  });

  it('reads a plain calendar date too', () => {
    expect(daysOverdue('2026-10-06', at('2026-10-07T00:14:00Z'))).toBe(0);
  });
});
