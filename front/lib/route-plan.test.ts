import { describe, expect, it } from 'vitest';
import {
  bestInsertion,
  distanceKm,
  formatKm,
  formatMinutes,
  groupUnplanned,
  loadSummary,
  moveStop,
  nearestOrder,
  routeEstimate,
  routeTitle,
  shiftDay,
  weekdayName,
  type Point,
} from './route-plan';

// Puntos sobre un mismo meridiano: 0,01° de latitud ≈ 1,11 km en línea recta,
// ≈ 1,45 km por calle.
const at = (step: number): Point => ({ latitude: -25.3 + step * 0.01, longitude: -57.6 });
const nowhere: Point = { latitude: null, longitude: null };
const stop = (id: string, point: Point) => ({ id, ...point });

describe('distanceKm', () => {
  it('estimates the street distance between two located points', () => {
    expect(distanceKm(at(0), at(1))).toBeCloseTo(1.45, 1);
    expect(distanceKm(at(0), at(0))).toBe(0);
  });

  it('is unknown when a location is missing', () => {
    expect(distanceKm(at(0), nowhere)).toBeNull();
  });
});

describe('routeEstimate', () => {
  it('adds the travel and the time spent at each stop', () => {
    // 3 paradas, 2 tramos de ~1,45 km: ~2,9 km → 7 min de viaje + 45 min de paradas.
    const estimate = routeEstimate([at(0), at(1), at(2)], 'MORNING');

    expect(estimate.km).toBeCloseTo(2.89, 1);
    expect(estimate.travelMinutes).toBe(7);
    expect(estimate.stopMinutes).toBe(45);
    expect(estimate.totalMinutes).toBe(52);
    expect(estimate.spareMinutes).toBe(300 - 52);
    expect(estimate.load).toBe('fits');
    expect(estimate.legs[0]).toBeNull();
    expect(estimate.legs[1]).toBeCloseTo(1.45, 1);
  });

  it('is empty for a route without stops', () => {
    expect(routeEstimate([], 'AFTERNOON')).toMatchObject({
      stops: 0,
      km: 0,
      totalMinutes: 0,
      load: 'fits',
    });
  });

  // 20 paradas son 300 min solo de paradas: no queda margen para viajar.
  it('says when the route does not fit in the shift', () => {
    const many = Array.from({ length: 20 }, (_, i) => at(i));

    expect(routeEstimate(many, 'MORNING').load).toBe('over');
    expect(routeEstimate(many, 'MORNING').spareMinutes).toBeLessThan(0);
  });

  it('says when it fits with little margin', () => {
    // 18 paradas juntas: 270 min de paradas, sobran 30 → todavía entra.
    const together = Array.from({ length: 18 }, () => at(0));
    expect(routeEstimate(together, 'MORNING').load).toBe('fits');
    expect(routeEstimate([...together, at(0)], 'MORNING').load).toBe('tight');
  });

  it('skips a stop without location and counts it as unknown', () => {
    const estimate = routeEstimate([at(0), nowhere, at(1)], 'MORNING');

    expect(estimate.unlocated).toBe(1);
    expect(estimate.km).toBeCloseTo(1.45, 1);
    expect(estimate.legs).toEqual([null, null, expect.any(Number)]);
    expect(estimate.stopMinutes).toBe(45);
  });
});

describe('bestInsertion', () => {
  it('puts a delivery between the two stops it lies between', () => {
    const insertion = bestInsertion([at(0), at(2)], at(1), 'MORNING');

    expect(insertion.position).toBe(1);
    expect(insertion.extraKm).toBeCloseTo(0, 5);
    expect(insertion.extraMinutes).toBe(15);
  });

  it('adds the detour of a delivery that is far away', () => {
    const insertion = bestInsertion([at(0), at(1)], at(10), 'MORNING');

    expect(insertion.position).toBe(2);
    expect(insertion.extraKm).toBeCloseTo(13, 0);
    expect(insertion.extraMinutes).toBeGreaterThan(15);
  });

  it('starts an empty route at no extra distance', () => {
    expect(bestInsertion([], at(3), 'MORNING')).toMatchObject({
      position: 0,
      extraKm: 0,
      extraMinutes: 15,
      load: 'fits',
    });
  });

  it('sends a delivery without location to the end', () => {
    expect(bestInsertion([at(0), at(1)], nowhere, 'MORNING')).toMatchObject({
      position: 2,
      extraKm: 0,
      extraMinutes: 15,
    });
  });

  it('warns when adding it takes the route over the shift', () => {
    const full = Array.from({ length: 19 }, () => at(0));

    expect(bestInsertion(full, at(0), 'MORNING').load).toBe('tight');
    expect(bestInsertion([...full, at(0)], at(0), 'MORNING').load).toBe('over');
  });
});

describe('nearestOrder', () => {
  it('goes to the closest stop each time, from the first one', () => {
    const stops = [stop('a', at(0)), stop('d', at(9)), stop('b', at(1)), stop('c', at(4))];

    expect(nearestOrder(stops)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves stops without location at the end', () => {
    const stops = [stop('x', nowhere), stop('a', at(0)), stop('c', at(5)), stop('b', at(1))];

    expect(nearestOrder(stops)).toEqual(['a', 'b', 'c', 'x']);
  });

  it('keeps the order when nothing is located', () => {
    expect(nearestOrder([stop('x', nowhere), stop('y', nowhere)])).toEqual(['x', 'y']);
  });
});

describe('moveStop', () => {
  it('moves a stop one place', () => {
    expect(moveStop(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveStop(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('does nothing at the ends', () => {
    const ids = ['a', 'b'];
    expect(moveStop(ids, 'a', -1)).toBe(ids);
    expect(moveStop(ids, 'b', 1)).toBe(ids);
  });
});

describe('labels', () => {
  it('writes durations the way people say them', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(135)).toBe('2 h 15 min');
  });

  it('writes distances with one decimal', () => {
    expect(formatKm(12.44)).toBe('12,4 km');
    expect(formatKm(0)).toBe('0,0 km');
    expect(formatKm(0.03)).toBe('0,1 km');
  });

  it('sums up whether the route fits', () => {
    expect(loadSummary({ load: 'fits', spareMinutes: 95 })).toBe('Sobran 1 h 35 min');
    expect(loadSummary({ load: 'tight', spareMinutes: 10 })).toBe('Justa: sobran 10 min');
    expect(loadSummary({ load: 'over', spareMinutes: -25 })).toBe('Se pasa 25 min del turno');
  });
});

describe('days', () => {
  it('moves to the next or the previous day across months', () => {
    expect(shiftDay('2026-10-08', 1)).toBe('2026-10-09');
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('names the weekday', () => {
    expect(weekdayName('2026-10-08')).toBe('jueves');
  });
});

describe('routeTitle', () => {
  const driver = { firstName: 'Luis', lastName: 'Rojas' };

  it('prefers the name, then the driver', () => {
    expect(routeTitle({ name: 'Zona norte', driver })).toBe('Zona norte');
    expect(routeTitle({ name: null, driver })).toBe('Luis Rojas');
    expect(routeTitle({ name: null, driver: null })).toBe('Ruta sin repartidor');
  });
});

describe('groupUnplanned', () => {
  it('sorts deliveries by when they are due relative to the day', () => {
    const stops = [
      { id: 'today', scheduledDate: '2026-10-08' },
      { id: 'late', scheduledDate: '2026-10-06' },
      { id: 'none', scheduledDate: null },
      { id: 'next', scheduledDate: '2026-10-09' },
    ];

    const groups = groupUnplanned(stops, '2026-10-08');

    expect(groups.forDay.map((s) => s.id)).toEqual(['today']);
    expect(groups.overdue.map((s) => s.id)).toEqual(['late']);
    expect(groups.undated.map((s) => s.id)).toEqual(['none']);
    expect(groups.later.map((s) => s.id)).toEqual(['next']);
  });
});
