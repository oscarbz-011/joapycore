import { describe, expect, it } from 'vitest';
import {
  mapLinks,
  progressLabel,
  routeActions,
  routeDuration,
  routeEventText,
  routeMapLink,
  routeProgress,
  type RouteViewer,
} from './delivery-route';

const TODAY = '2026-10-08';

const planner: RouteViewer = { canPlan: true, canManage: true, isDriver: false };
const driver: RouteViewer = { canPlan: false, canManage: false, isDriver: true };
const otherDriver: RouteViewer = { canPlan: false, canManage: false, isDriver: false };

const route = (overrides = {}) => ({
  status: 'OPEN' as const,
  date: TODAY,
  stops: 3,
  hasDriver: true,
  ...overrides,
});

describe('routeActions', () => {
  it('lets logistics arrange a route that has not left', () => {
    expect(routeActions(route(), planner, TODAY)).toMatchObject({
      plan: true,
      addStops: true,
      reorder: true,
      start: true,
      cancel: true,
      failStops: false,
    });
  });

  it('lets its driver start it but not rearrange it', () => {
    expect(routeActions(route(), driver, TODAY)).toMatchObject({
      plan: false,
      addStops: false,
      start: true,
      cancel: false,
    });
  });

  it('gives another driver nothing to do', () => {
    expect(routeActions(route(), otherDriver, TODAY)).toMatchObject({
      start: false,
      startBlocked: null,
      failStops: false,
    });
  });

  it('says why a route cannot start yet', () => {
    expect(routeActions(route({ stops: 0 }), planner, TODAY)).toMatchObject({
      start: false,
      startBlocked: 'La ruta no tiene entregas para llevar.',
    });
    expect(routeActions(route({ date: '2026-10-09' }), driver, TODAY)).toMatchObject({
      start: false,
      startBlocked: 'La ruta está armada para otro día.',
    });
    expect(routeActions(route({ hasDriver: false }), planner, TODAY).startBlocked).toBe(
      'La ruta no tiene repartidor.',
    );
  });

  // Una ruta que no salió en su día se puede iniciar igual.
  it('still starts a route left over from a previous day', () => {
    expect(routeActions(route({ date: '2026-10-07' }), driver, TODAY).start).toBe(true);
  });

  it('on the road: more deliveries and failed stops, but no new plan', () => {
    const onTheRoad = route({ status: 'IN_PROGRESS' as const });

    expect(routeActions(onTheRoad, planner, TODAY)).toMatchObject({
      plan: false,
      addStops: true,
      reorder: true,
      start: false,
      cancel: false,
      failStops: true,
    });
    expect(routeActions(onTheRoad, driver, TODAY)).toMatchObject({
      addStops: false,
      failStops: true,
    });
  });

  it('leaves a finished route untouched', () => {
    for (const status of ['COMPLETED', 'CANCELLED'] as const) {
      expect(routeActions(route({ status }), planner, TODAY)).toEqual({
        plan: false,
        addStops: false,
        reorder: false,
        start: false,
        startBlocked: null,
        cancel: false,
        failStops: false,
      });
    }
  });
});

describe('progress', () => {
  it('counts the stops by where they are', () => {
    const progress = routeProgress([
      { status: 'DELIVERED' },
      { status: 'DELIVERED' },
      { status: 'DISPATCHED' },
      { status: 'PENDING' },
    ]);

    expect(progress).toEqual({ total: 4, delivered: 2, onTheWay: 1, pending: 1 });
    expect(progressLabel(progress)).toBe('2 de 4 entregadas');
  });

  it('reads well for one stop and for none', () => {
    expect(progressLabel({ total: 1, delivered: 1 })).toBe('1 de 1 entregada');
    expect(progressLabel({ total: 0, delivered: 0 })).toBe('Sin entregas');
  });

  it('measures how long the route was out', () => {
    expect(routeDuration('2026-10-08T12:00:00Z', '2026-10-08T14:20:00Z')).toBe('2 h 20 min');
    expect(routeDuration('2026-10-08T12:00:00Z', null)).toBeNull();
    expect(routeDuration(null, null)).toBeNull();
  });
});

describe('routeEventText', () => {
  const text = (type: Parameters<typeof routeEventText>[0]['type'], detail?: string, reason?: string) =>
    routeEventText({ type, detail: detail ?? null, reason: reason ?? null });

  it('tells what happened to each delivery', () => {
    expect(text('STOP_ADDED', 'María González')).toBe('Se sumó la entrega de María González');
    expect(text('STOP_DELIVERED', 'María González')).toBe('Se entregó el pedido de María González');
    expect(text('STOP_REMOVED', 'María González (pasó a la ruta RUT-26-000002)')).toBe(
      'Salió de la ruta la entrega de María González (pasó a la ruta RUT-26-000002)',
    );
  });

  it('gives the reason of a failed delivery', () => {
    expect(text('STOP_FAILED', 'María González', 'No había nadie para recibir. Vuelve el lunes')).toBe(
      'No se pudo entregar a María González: no había nadie para recibir. Vuelve el lunes',
    );
    expect(text('STOP_FAILED', 'María González')).toBe('No se pudo entregar a María González');
  });

  it('tells the life of the route', () => {
    expect(text('CREATED')).toBe('Se creó la ruta');
    expect(text('STARTED')).toBe('La ruta salió');
    expect(text('COMPLETED')).toBe('La ruta finalizó');
    expect(text('CANCELLED')).toBe('Se canceló la ruta');
    expect(text('CHECKPOINT', 'En camino')).toBe('Toda la ruta: en camino');
    expect(text('DRIVER_CHANGED', 'De Luis Rojas a Ana Vera')).toBe(
      'Cambió el repartidor: de Luis Rojas a Ana Vera',
    );
  });
});

describe('mapLinks', () => {
  it('navigates to the saved location', () => {
    expect(mapLinks({ latitude: -25.29, longitude: -57.58, address: 'Av. España 123' })).toEqual({
      google: 'https://www.google.com/maps/dir/?api=1&destination=-25.29,-57.58&travelmode=driving',
      waze: 'https://waze.com/ul?ll=-25.29,-57.58&navigate=yes',
    });
  });

  it('falls back to the written address, which only Google can search', () => {
    expect(mapLinks({ latitude: null, longitude: null, address: 'Av. España 123, Asunción' })).toEqual({
      google:
        'https://www.google.com/maps/dir/?api=1&destination=Av.%20Espa%C3%B1a%20123%2C%20Asunci%C3%B3n&travelmode=driving',
      waze: null,
    });
  });

  it('has nothing to open without location or address', () => {
    expect(mapLinks({ latitude: null, longitude: null, address: '  ' })).toBeNull();
  });
});

describe('routeMapLink', () => {
  const at = (n: number) => ({ latitude: -25 - n / 100, longitude: -57.5, address: null });

  it('chains the stops in order, ending at the last one', () => {
    expect(routeMapLink([at(1), at(2), at(3)])).toEqual({
      url: 'https://www.google.com/maps/dir/?api=1&destination=-25.03%2C-57.5&waypoints=-25.01%2C-57.5%7C-25.02%2C-57.5&travelmode=driving',
      left: 0,
    });
  });

  it('is a plain destination for a single stop', () => {
    expect(routeMapLink([at(1)])?.url).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-25.01%2C-57.5&travelmode=driving',
    );
  });

  it('uses the address of a stop without location and skips one with neither', () => {
    const link = routeMapLink([
      at(1),
      { latitude: null, longitude: null, address: 'Calle 1' },
      { latitude: null, longitude: null, address: null },
    ]);

    expect(link?.url).toContain('destination=Calle%201');
    expect(link?.left).toBe(1);
  });

  // Google corta en 9 paradas intermedias.
  it('says how many stops did not fit', () => {
    const link = routeMapLink(Array.from({ length: 13 }, (_, i) => at(i)));

    expect(link?.left).toBe(3);
    expect(link?.url.split('%7C')).toHaveLength(9);
  });

  it('is nothing when no stop can be located', () => {
    expect(routeMapLink([{ latitude: null, longitude: null, address: null }])).toBeNull();
    expect(routeMapLink([])).toBeNull();
  });
});
