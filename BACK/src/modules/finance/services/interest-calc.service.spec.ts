import { InterestCalcService } from './interest-calc.service';

describe('InterestCalcService', () => {
  const service = new InterestCalcService();

  describe('daysOverdue / periodsElapsed', () => {
    it('returns 0 before the grace deadline', () => {
      const dueDate = new Date('2026-01-01T00:00:00.000Z');
      const now = new Date('2026-01-04T00:00:00.000Z');
      expect(service.daysOverdue(dueDate, 5, now)).toBe(0);
      expect(service.periodsElapsed(dueDate, 5, now)).toBe(0);
    });

    it('counts days from the grace deadline, not from dueDate', () => {
      const dueDate = new Date('2026-01-01T00:00:00.000Z');
      // grace=5 -> deadline 2026-01-06; 10 days after that = 2026-01-16
      const now = new Date('2026-01-16T00:00:00.000Z');
      expect(service.daysOverdue(dueDate, 5, now)).toBe(10);
    });

    it('charges monthly components from the first overdue day and increments every 30 days', () => {
      const dueDate = new Date('2026-01-01T00:00:00.000Z');
      expect(
        service.periodsElapsed(
          dueDate,
          0,
          new Date('2026-01-02T00:00:00.000Z'),
        ),
      ).toBe(1);
      expect(
        service.periodsElapsed(
          dueDate,
          0,
          new Date('2026-01-31T00:00:00.000Z'),
        ),
      ).toBe(1);
      expect(
        service.periodsElapsed(
          dueDate,
          0,
          new Date('2026-02-01T00:00:00.000Z'),
        ),
      ).toBe(2);
    });
  });

  describe('computeComponentCharge', () => {
    // Los recargos se cobran en guaraníes enteros: 15.812 × 2,5 % = 395,3.
    it('rounds the charge to whole guaraníes', () => {
      const charge = service.computeComponentCharge(
        { frequency: 'ONE_TIME', percentage: '2.5', cumulative: false },
        15812,
        1,
        0,
      );
      expect(charge.toString()).toBe('395');
    });

    const base = { percentage: 10, cumulative: false };

    it('ONE_TIME charges a flat % once triggered, regardless of how many days pass', () => {
      const component = { ...base, frequency: 'ONE_TIME' as const };
      expect(
        service.computeComponentCharge(component, 1_000_000, 0, 0).toNumber(),
      ).toBe(0);
      expect(
        service.computeComponentCharge(component, 1_000_000, 1, 0).toNumber(),
      ).toBe(100_000);
      expect(
        service.computeComponentCharge(component, 1_000_000, 45, 1).toNumber(),
      ).toBe(100_000);
    });

    it('DAILY accrues proportionally to days overdue', () => {
      const component = { ...base, frequency: 'DAILY' as const };
      expect(
        service.computeComponentCharge(component, 1_000_000, 0, 0).toNumber(),
      ).toBe(0);
      expect(
        service.computeComponentCharge(component, 1_000_000, 5, 0).toNumber(),
      ).toBe(500_000);
      expect(
        service.computeComponentCharge(component, 1_000_000, 10, 0).toNumber(),
      ).toBe(1_000_000);
    });

    it('MONTHLY non-cumulative charges the base % once, flat', () => {
      const component = {
        ...base,
        frequency: 'MONTHLY' as const,
        cumulative: false,
      };
      expect(
        service.computeComponentCharge(component, 1_000_000, 0, 0).toNumber(),
      ).toBe(0);
      expect(
        service.computeComponentCharge(component, 1_000_000, 1, 1).toNumber(),
      ).toBe(100_000);
      expect(
        service.computeComponentCharge(component, 1_000_000, 40, 1).toNumber(),
      ).toBe(100_000);
      expect(
        service.computeComponentCharge(component, 1_000_000, 95, 3).toNumber(),
      ).toBe(100_000);
    });

    // Ejemplo exacto dado por el usuario: mes 1=10%, mes 2=10%+10%=20%,
    // mes 3=20%+10%=30% — acumulación lineal, no interés compuesto.
    it('MONTHLY cumulative grows linearly with elapsed periods (10/20/30% example)', () => {
      const component = {
        ...base,
        frequency: 'MONTHLY' as const,
        cumulative: true,
      };
      expect(
        service.computeComponentCharge(component, 1_000_000, 40, 1).toNumber(),
      ).toBe(100_000);
      expect(
        service.computeComponentCharge(component, 1_000_000, 65, 2).toNumber(),
      ).toBe(200_000);
      expect(
        service.computeComponentCharge(component, 1_000_000, 95, 3).toNumber(),
      ).toBe(300_000);
    });
  });
});
