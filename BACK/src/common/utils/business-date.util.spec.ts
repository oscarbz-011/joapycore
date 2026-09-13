import { startOfBusinessDay } from './business-date.util';

describe('startOfBusinessDay', () => {
  it('returns the Paraguay calendar day as UTC midnight', () => {
    // 13/09 10:00 en Asunción (UTC-3)
    expect(
      startOfBusinessDay(new Date('2026-09-13T13:00:00Z')).toISOString(),
    ).toBe('2026-09-13T00:00:00.000Z');
  });

  it('is still the previous day in Paraguay right after UTC midnight', () => {
    // 14/09 01:30 UTC = 13/09 22:30 en Asunción
    expect(
      startOfBusinessDay(new Date('2026-09-14T01:30:00Z')).toISOString(),
    ).toBe('2026-09-13T00:00:00.000Z');
  });

  // Regresión: una cuota que vence hoy no está vencida en ningún momento del día.
  it('does not consider an installment due today as overdue at any hour of that day', () => {
    const dueDate = new Date('2026-09-13T00:00:00Z');
    for (const utc of [
      '2026-09-13T03:00:00Z',
      '2026-09-13T15:00:00Z',
      '2026-09-14T02:59:00Z',
    ]) {
      expect(dueDate < startOfBusinessDay(new Date(utc))).toBe(false);
    }
    // 14/09 00:00 en Asunción: ahora sí está vencida.
    expect(dueDate < startOfBusinessDay(new Date('2026-09-14T03:00:00Z'))).toBe(
      true,
    );
  });
});
