// La pantalla del repartidor: una sola lista con lo que tiene por hacer,
// agrupada por ruta y en el orden del recorrido, y aparte lo que le asignaron
// fuera de una ruta.

import type { DeliveryRoute, RouteStop } from './api/delivery-routes';
import {
  CHECKPOINT_LABELS,
  type DeliveryCheckpoint,
  type DeliveryNote,
  type DeliveryNoteStatus,
} from './api/logistics';
import type { Customer } from './api/sales';

/** La dirección de entrega del cliente: la estructurada, o la escrita a mano. */
export function formatDeliveryAddress(
  customer: Pick<
    Customer,
    'homeStreet' | 'homeNeighborhood' | 'aptBuilding' | 'aptFloor' | 'aptNumber' | 'address' | 'city'
  >,
): string | null {
  const houseParts = [customer.homeStreet, customer.homeNeighborhood].filter(Boolean);
  const aptParts = [customer.aptBuilding, customer.aptFloor, customer.aptNumber].filter(Boolean);
  const structured = [...houseParts, ...aptParts].join(', ');
  if (structured) return structured;
  if (customer.address) return [customer.address, customer.city].filter(Boolean).join(', ');
  return null;
}

/** Los hitos que el repartidor marca antes de entregar, en orden. */
export const CHECKPOINT_ORDER: DeliveryCheckpoint[] = ['LEFT_WAREHOUSE', 'IN_TRANSIT', 'ARRIVED'];

type Tracked = { trackingEvents: { checkpoint: DeliveryCheckpoint | null }[] };

/** El próximo hito por marcar; null si ya marcó todos. */
export function nextCheckpoint(note: Tracked): DeliveryCheckpoint | null {
  const done = new Set(note.trackingEvents.map((event) => event.checkpoint));
  return CHECKPOINT_ORDER.find((checkpoint) => !done.has(checkpoint)) ?? null;
}

/** En qué anda la entrega, en dos palabras: "Por salir", "Llegó al destino"… */
export function deliveryStage(note: { status: DeliveryNoteStatus } & Partial<Tracked>): string {
  if (note.status === 'PENDING') return 'Por salir';
  if (note.status === 'DELIVERED') return 'Entregado';
  if (note.status === 'CANCELLED') return 'Cancelado';
  const done = new Set((note.trackingEvents ?? []).map((event) => event.checkpoint));
  const last = [...CHECKPOINT_ORDER].reverse().find((checkpoint) => done.has(checkpoint));
  return last ? CHECKPOINT_LABELS[last] : 'En camino';
}

/** Lo que se muestra de una entrega, venga de una ruta o suelta. */
export interface DeliveryCardData {
  id: string;
  status: DeliveryNoteStatus;
  customerName: string;
  address: string | null;
  reference: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  items: { name: string; quantity: number }[];
}

export function cardFromNote(note: DeliveryNote): DeliveryCardData {
  const customer = note.saleOrder.customer;
  return {
    id: note.id,
    status: note.status,
    customerName: `${customer.firstName} ${customer.lastName}`.trim(),
    address: formatDeliveryAddress(customer),
    reference: customer.homeReference,
    phone: customer.phone,
    latitude: customer.latitude,
    longitude: customer.longitude,
    items: note.saleOrder.items.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
    })),
  };
}

export function cardFromStop(stop: RouteStop): DeliveryCardData {
  return {
    id: stop.id,
    status: stop.status,
    customerName: stop.customer.name,
    address: stop.customer.address,
    reference: stop.customer.reference,
    phone: stop.customer.phone,
    latitude: stop.customer.latitude,
    longitude: stop.customer.longitude,
    items: stop.items,
  };
}

export interface MyRouteStop {
  stop: RouteStop;
  /** La entrega completa, con su recorrido; null si ya no está por hacer. */
  note: DeliveryNote | null;
}

export interface MyRouteGroup {
  route: DeliveryRoute;
  stops: MyRouteStop[];
}

export interface MyWork {
  /** La ruta en curso primero; después las que faltan salir, por fecha. */
  routes: MyRouteGroup[];
  /** Entregas asignadas fuera de una ruta: primero las que ya están en camino. */
  loose: DeliveryNote[];
  /** Cuántas entregas le quedan por hacer en total. */
  todo: number;
}

/**
 * Junta las rutas del repartidor con sus entregas por hacer, sin repetir
 * ninguna: la que va en una ruta aparece solo ahí, en su lugar del recorrido.
 */
export function organizeMyWork(routes: DeliveryRoute[], openNotes: DeliveryNote[]): MyWork {
  const byId = new Map(openNotes.map((note) => [note.id, note]));
  const inRoute = new Set<string>();

  const groups = [...routes]
    .sort(
      (a, b) =>
        Number(b.status === 'IN_PROGRESS') - Number(a.status === 'IN_PROGRESS') ||
        a.date.localeCompare(b.date),
    )
    .map((route) => ({
      route,
      stops: route.stops.map((stop) => {
        inRoute.add(stop.id);
        return { stop, note: byId.get(stop.id) ?? null };
      }),
    }));

  const loose = openNotes
    .filter((note) => !inRoute.has(note.id))
    .sort((a, b) => Number(b.status === 'DISPATCHED') - Number(a.status === 'DISPATCHED'));

  const openInRoutes = groups
    .flatMap((group) => group.stops)
    .filter(({ stop }) => stop.status === 'PENDING' || stop.status === 'DISPATCHED').length;

  return { routes: groups, loose, todo: openInRoutes + loose.length };
}

// ── Pestañas de la pantalla ─────────────────────────────────────────────────

/** "Asignadas" es lo que todavía no salió; "En curso", lo que está en la calle. */
export type MyTab = 'assigned' | 'inProgress';

export interface MyTabWork {
  routes: MyRouteGroup[];
  loose: DeliveryNote[];
  /** Entregas por hacer en la pestaña. */
  count: number;
}

/**
 * Reparte el trabajo en las dos pestañas. Una ruta va entera a una sola: la
 * que no salió, a "Asignadas"; la que está en la calle, a "En curso", con sus
 * paradas ya entregadas a la vista.
 */
export function splitMyWork(work: MyWork): Record<MyTab, MyTabWork> {
  const tab = (routeStatus: DeliveryRoute['status'], noteStatus: DeliveryNoteStatus): MyTabWork => {
    const routes = work.routes.filter(({ route }) => route.status === routeStatus);
    const loose = work.loose.filter((note) => note.status === noteStatus);
    const inRoutes = routes
      .flatMap((group) => group.stops)
      .filter(({ stop }) => stop.status === noteStatus).length;
    return { routes, loose, count: inRoutes + loose.length };
  };
  return { assigned: tab('OPEN', 'PENDING'), inProgress: tab('IN_PROGRESS', 'DISPATCHED') };
}

/** Los hitos que se pueden marcar para toda la ruta de una vez. */
export const ROUTE_CHECKPOINTS = ['LEFT_WAREHOUSE', 'IN_TRANSIT'] as const;
export type RouteCheckpoint = (typeof ROUTE_CHECKPOINTS)[number];

/**
 * El hito que toca marcar para toda la ruta: el primero que le falta a alguna
 * entrega en camino. Null cuando no queda ninguno (llegar y entregar son de
 * cada parada).
 */
export function routeCheckpointToMark(group: MyRouteGroup): RouteCheckpoint | null {
  const onTheWay = group.stops.flatMap(({ note }) =>
    note && note.status === 'DISPATCHED' ? [note] : [],
  );
  return (
    ROUTE_CHECKPOINTS.find((checkpoint) =>
      onTheWay.some((note) => !note.trackingEvents.some((event) => event.checkpoint === checkpoint)),
    ) ?? null
  );
}
