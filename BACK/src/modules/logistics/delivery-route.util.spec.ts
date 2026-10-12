import {
  isSameStops,
  nextRouteCode,
  parseRouteDay,
  placeStop,
} from './delivery-route.util';

describe('parseRouteDay', () => {
  it('reads a calendar day as UTC midnight', () => {
    expect(parseRouteDay('2026-10-08')?.toISOString()).toBe(
      '2026-10-08T00:00:00.000Z',
    );
  });

  it('refuses what is not a real day', () => {
    expect(parseRouteDay('2026-02-30')).toBeNull();
    expect(parseRouteDay('08/10/2026')).toBeNull();
    expect(parseRouteDay('2026-10-08T10:00:00Z')).toBeNull();
  });
});

describe('placeStop', () => {
  it('adds a new stop at the end by default', () => {
    expect(placeStop(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('puts it where it was asked', () => {
    expect(placeStop(['a', 'b'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(placeStop(['a', 'b'], 'c', 1)).toEqual(['a', 'c', 'b']);
  });

  it('sends an out-of-range position to the end', () => {
    expect(placeStop(['a', 'b'], 'c', 9)).toEqual(['a', 'b', 'c']);
    expect(placeStop(['a', 'b'], 'c', -1)).toEqual(['a', 'b', 'c']);
  });

  it('moves a stop that was already there instead of repeating it', () => {
    expect(placeStop(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });
});

describe('isSameStops', () => {
  it('accepts the same stops in another order', () => {
    expect(isSameStops(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
  });

  it('refuses a missing, extra or repeated stop', () => {
    expect(isSameStops(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
    expect(isSameStops(['a', 'b'], ['a', 'b', 'x'])).toBe(false);
    expect(isSameStops(['a', 'b'], ['a', 'a'])).toBe(false);
    expect(isSameStops(['a', 'b'], ['a', 'x'])).toBe(false);
  });
});

describe('nextRouteCode', () => {
  const now = new Date('2026-10-08T12:00:00.000Z');

  it('starts the numbering of a tenant', () => {
    expect(nextRouteCode(null, now)).toBe('RUT-26-000001');
  });

  it('follows the last code', () => {
    expect(nextRouteCode('RUT-26-000041', now)).toBe('RUT-26-000042');
  });

  // El correlativo no vuelve a 1 con el año nuevo.
  it('keeps counting across years', () => {
    expect(
      nextRouteCode('RUT-26-000041', new Date('2027-01-02T12:00:00Z')),
    ).toBe('RUT-27-000042');
  });

  it('starts over from a code it does not recognise', () => {
    expect(nextRouteCode('ruta vieja', now)).toBe('RUT-26-000001');
  });
});
