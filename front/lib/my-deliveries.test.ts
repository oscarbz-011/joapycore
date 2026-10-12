import { describe, expect, it } from 'vitest';
import type { DeliveryRoute, RouteStop } from './api/delivery-routes';
import type { DeliveryNote } from './api/logistics';
import {
  cardFromNote,
  cardFromStop,
  deliveryStage,
  formatDeliveryAddress,
  nextCheckpoint,
  organizeMyWork,
  groupStopsByCustomer,
  routeCheckpointToMark,
  splitMyWork,
  stopNextCheckpoint,
  stopStage,
} from './my-deliveries';

const stop = (id: string, status: RouteStop['status'] = 'DISPATCHED'): RouteStop => ({
  id,
  noteNumber: null,
  status,
  routeId: 'route',
  deliveredAt: null,
  saleOrderId: `order-${id}`,
  units: 1,
  items: [{ name: 'Ventilador', quantity: 1 }],
  customer: {
    id: `cust-${id}`,
    name: `Cliente ${id}`,
    phone: '0981 111 222',
    address: 'Av. Caballero 123, Encarnación',
    reference: 'Portón verde',
    latitude: -27.33,
    longitude: -55.86,
  },
});

const route = (id: string, overrides: Partial<DeliveryRoute> = {}): DeliveryRoute => ({
  id,
  code: `RUT-26-00000${id}`,
  date: '2026-10-08',
  status: 'OPEN',
  vehicle: null,
  driver: { id: 'emp-1', firstName: 'Armando', lastName: 'Pérez' },
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-10-08T10:00:00Z',
  stops: [],
  ...overrides,
});

// Solo lo que estas reglas miran de una entrega.
const note = (
  id: string,
  status: DeliveryNote['status'] = 'DISPATCHED',
  checkpoints: DeliveryNote['trackingEvents'][number]['checkpoint'][] = [],
) =>
  ({
    id,
    status,
    trackingEvents: checkpoints.map((checkpoint) => ({ checkpoint })),
    saleOrder: {
      customer: {
        firstName: 'Marcos',
        lastName: 'Benítez',
        phone: '0991 234 123',
        homeStreet: 'Av. Irrazábal',
        homeNeighborhood: 'Obrero',
        homeReference: 'Casa de esquina',
        aptBuilding: null,
        aptFloor: null,
        aptNumber: null,
        address: 'otra',
        city: 'Encarnación',
        latitude: null,
        longitude: null,
      },
      items: [{ quantity: 2, product: { name: 'TV Smart 43"' } }],
    },
  }) as unknown as DeliveryNote;

describe('organizeMyWork', () => {
  // El pedido que va en una ruta se veía dos veces: en la ruta y en la lista.
  it('shows a delivery of a route only inside its route', () => {
    const work = organizeMyWork(
      [route('1', { stops: [stop('a'), stop('b')] })],
      [note('a'), note('b'), note('c')],
    );

    expect(work.routes[0].stops.map(({ stop: s }) => s.id)).toEqual(['a', 'b']);
    expect(work.loose.map((n) => n.id)).toEqual(['c']);
    expect(work.todo).toBe(3);
  });

  it('keeps the stops in the order of the route, each with its delivery', () => {
    const work = organizeMyWork([route('1', { stops: [stop('b'), stop('a')] })], [note('a'), note('b')]);

    expect(work.routes[0].stops.map(({ stop: s, note: n }) => [s.id, n?.id])).toEqual([
      ['b', 'b'],
      ['a', 'a'],
    ]);
  });

  it('puts the route on the road first, then the others by date', () => {
    const work = organizeMyWork(
      [
        route('1', { date: '2026-10-10' }),
        route('2', { date: '2026-10-09' }),
        route('3', { date: '2026-10-12', status: 'IN_PROGRESS' }),
      ],
      [],
    );

    expect(work.routes.map(({ route: r }) => r.id)).toEqual(['3', '2', '1']);
  });

  it('lists loose deliveries on the way before the ones waiting', () => {
    const work = organizeMyWork([], [note('waiting', 'PENDING'), note('moving', 'DISPATCHED')]);

    expect(work.loose.map((n) => n.id)).toEqual(['moving', 'waiting']);
  });

  // Una parada ya entregada sigue en la ruta, pero no cuenta como pendiente.
  it('does not count what is already delivered', () => {
    const work = organizeMyWork(
      [route('1', { status: 'IN_PROGRESS', stops: [stop('a', 'DELIVERED'), stop('b')] })],
      [note('b')],
    );

    expect(work.routes[0].stops[0].note).toBeNull();
    expect(work.todo).toBe(1);
  });

  it('is empty when there is nothing to do', () => {
    expect(organizeMyWork([], [])).toEqual({ routes: [], loose: [], todo: 0 });
  });
});

describe('checkpoints', () => {
  it('offers the next one to mark', () => {
    expect(nextCheckpoint(note('a'))).toBe('LEFT_WAREHOUSE');
    expect(nextCheckpoint(note('a', 'DISPATCHED', ['LEFT_WAREHOUSE']))).toBe('IN_TRANSIT');
    expect(nextCheckpoint(note('a', 'DISPATCHED', ['LEFT_WAREHOUSE', 'IN_TRANSIT', 'ARRIVED']))).toBeNull();
  });

  it('says where the delivery is', () => {
    expect(deliveryStage(note('a', 'PENDING'))).toBe('Por salir');
    expect(deliveryStage(note('a'))).toBe('En camino');
    expect(deliveryStage(note('a', 'DISPATCHED', ['LEFT_WAREHOUSE']))).toBe('Salió del depósito');
    expect(deliveryStage(note('a', 'DISPATCHED', ['LEFT_WAREHOUSE', 'ARRIVED']))).toBe('Llegó al destino');
    expect(deliveryStage({ status: 'DELIVERED' })).toBe('Entregado');
  });
});

describe('what a card shows', () => {
  it('reads a loose delivery', () => {
    expect(cardFromNote(note('a'))).toEqual({
      id: 'a',
      status: 'DISPATCHED',
      customerName: 'Marcos Benítez',
      address: 'Av. Irrazábal, Obrero',
      reference: 'Casa de esquina',
      phone: '0991 234 123',
      latitude: null,
      longitude: null,
      items: [{ name: 'TV Smart 43"', quantity: 2 }],
    });
  });

  it('reads a stop of a route the same way', () => {
    expect(cardFromStop(stop('a'))).toMatchObject({
      id: 'a',
      customerName: 'Cliente a',
      address: 'Av. Caballero 123, Encarnación',
      reference: 'Portón verde',
      items: [{ name: 'Ventilador', quantity: 1 }],
    });
  });
});

describe('formatDeliveryAddress', () => {
  const blank = {
    homeStreet: null,
    homeNeighborhood: null,
    aptBuilding: null,
    aptFloor: null,
    aptNumber: null,
    address: null,
    city: null,
  };

  it('prefers the structured address', () => {
    expect(
      formatDeliveryAddress({ ...blank, homeStreet: 'Av. Irrazábal', aptBuilding: 'Torre 2', address: 'x' }),
    ).toBe('Av. Irrazábal, Torre 2');
  });

  it('falls back to the written one, with the city', () => {
    expect(formatDeliveryAddress({ ...blank, address: 'Calle 1', city: 'Encarnación' })).toBe(
      'Calle 1, Encarnación',
    );
    expect(formatDeliveryAddress(blank)).toBeNull();
  });
});

describe('splitMyWork', () => {
  const work = organizeMyWork(
    [
      route('1', { stops: [stop('a', 'PENDING'), stop('b', 'PENDING')] }),
      route('2', { status: 'IN_PROGRESS', stops: [stop('c', 'DELIVERED'), stop('d')] }),
    ],
    [note('a', 'PENDING'), note('b', 'PENDING'), note('d'), note('x', 'PENDING'), note('y')],
  );
  const tabs = splitMyWork(work);

  it('puts what has not left under assigned', () => {
    expect(tabs.assigned.routes.map(({ route: r }) => r.id)).toEqual(['1']);
    expect(tabs.assigned.loose.map((n) => n.id)).toEqual(['x']);
    expect(tabs.assigned.count).toBe(3);
  });

  // La ruta en curso va entera, con lo ya entregado a la vista, pero cuenta
  // solo lo que falta.
  it('puts what is on the road under in progress', () => {
    expect(tabs.inProgress.routes.map(({ route: r }) => r.id)).toEqual(['2']);
    expect(tabs.inProgress.routes[0].stops).toHaveLength(2);
    expect(tabs.inProgress.loose.map((n) => n.id)).toEqual(['y']);
    expect(tabs.inProgress.count).toBe(2);
  });
});

describe('routeCheckpointToMark', () => {
  const group = (notes: DeliveryNote[]) =>
    organizeMyWork(
      [route('1', { status: 'IN_PROGRESS', stops: notes.map((n) => stop(n.id)) })],
      notes,
    ).routes[0];

  it('offers the first checkpoint some delivery on the way is missing', () => {
    expect(routeCheckpointToMark(group([note('a'), note('b', 'DISPATCHED', ['LEFT_WAREHOUSE'])]))).toBe(
      'LEFT_WAREHOUSE',
    );
    expect(
      routeCheckpointToMark(
        group([
          note('a', 'DISPATCHED', ['LEFT_WAREHOUSE']),
          note('b', 'DISPATCHED', ['LEFT_WAREHOUSE', 'IN_TRANSIT']),
        ]),
      ),
    ).toBe('IN_TRANSIT');
  });

  // Llegar y entregar se marcan en cada parada.
  it('has nothing to offer once every delivery is in transit', () => {
    expect(
      routeCheckpointToMark(group([note('a', 'DISPATCHED', ['LEFT_WAREHOUSE', 'IN_TRANSIT'])])),
    ).toBeNull();
  });

  it('ignores a route with nothing on the way', () => {
    expect(routeCheckpointToMark(group([]))).toBeNull();
  });
});

// Dos pedidos distintos del mismo cliente en la misma ruta.
describe('groupStopsByCustomer', () => {
  const sameCustomer = (id: string, status: RouteStop['status'], item: string): RouteStop => ({
    ...stop(id, status),
    customer: { ...stop(id).customer, id: 'cust-jorge', name: 'Jorge Britez' },
    items: [{ name: item, quantity: 1 }],
  });
  const routed = (stops: RouteStop[], notes: DeliveryNote[] = []) =>
    organizeMyWork([route('1', { status: 'IN_PROGRESS', stops })], notes).routes[0].stops;

  it('makes one stop out of the orders of the same customer', () => {
    const groups = groupStopsByCustomer(
      routed([
        sameCustomer('a', 'DISPATCHED', 'Ventilador'),
        stop('other'),
        sameCustomer('b', 'DISPATCHED', 'TV Smart 43"'),
      ]),
    );

    // Queda en el lugar de su primer pedido.
    expect(groups.map((group) => group.customerId)).toEqual(['cust-jorge', 'cust-other']);
    expect(groups[0].stops.map(({ stop: s }) => s.id)).toEqual(['a', 'b']);
    expect(groups[0].card).toMatchObject({
      customerName: 'Jorge Britez',
      status: 'DISPATCHED',
      items: [
        { name: 'Ventilador', quantity: 1 },
        { name: 'TV Smart 43"', quantity: 1 },
      ],
    });
  });

  it('adds up the same product across orders', () => {
    const [group] = groupStopsByCustomer(
      routed([sameCustomer('a', 'PENDING', 'Ventilador'), sameCustomer('b', 'PENDING', 'Ventilador')]),
    );

    expect(group.card.items).toEqual([{ name: 'Ventilador', quantity: 2 }]);
    expect(group.card.status).toBe('PENDING');
  });

  // Mientras quede un pedido en camino, la parada sigue abierta y muestra lo que falta.
  it('stays open until every order is delivered', () => {
    const half = groupStopsByCustomer(
      routed([sameCustomer('a', 'DELIVERED', 'Ventilador'), sameCustomer('b', 'DISPATCHED', 'TV Smart 43"')]),
    )[0];
    expect(half.card.status).toBe('DISPATCHED');
    expect(half.card.items).toEqual([{ name: 'TV Smart 43"', quantity: 1 }]);

    const done = groupStopsByCustomer(
      routed([sameCustomer('a', 'DELIVERED', 'Ventilador'), sameCustomer('b', 'DELIVERED', 'TV Smart 43"')]),
    )[0];
    expect(done.card.status).toBe('DELIVERED');
    expect(done.card.items).toHaveLength(2);
  });

  it('keeps the open deliveries of the stop, to act on all of them', () => {
    const [group] = groupStopsByCustomer(
      routed(
        [sameCustomer('a', 'DISPATCHED', 'Ventilador'), sameCustomer('b', 'DISPATCHED', 'TV Smart 43"')],
        [note('a'), note('b')],
      ),
    );

    expect(group.notes.map((n) => n.id)).toEqual(['a', 'b']);
  });
});

describe('the state of a stop with several orders', () => {
  const ahead = note('a', 'DISPATCHED', ['LEFT_WAREHOUSE', 'IN_TRANSIT']);
  const behind = note('b', 'DISPATCHED', ['LEFT_WAREHOUSE']);

  it('offers the checkpoint the order behind is missing', () => {
    expect(stopNextCheckpoint([ahead, behind])).toBe('IN_TRANSIT');
    expect(stopNextCheckpoint([ahead])).toBe('ARRIVED');
    expect(stopNextCheckpoint([])).toBeNull();
  });

  it('is where the order behind is', () => {
    expect(stopStage('DISPATCHED', [ahead, behind])).toBe('Salió del depósito');
    expect(stopStage('DISPATCHED', [ahead])).toBe('En camino');
    expect(stopStage('DISPATCHED', [note('c')])).toBe('En camino');
    expect(stopStage('PENDING', [])).toBe('Por salir');
    expect(stopStage('DELIVERED', [])).toBe('Entregado');
  });
});
