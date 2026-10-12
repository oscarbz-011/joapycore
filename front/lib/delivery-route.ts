// Reglas de pantalla de una ruta de entrega: qué se puede hacer en cada
// estado, cómo se cuenta su avance, cómo se lee su historial y cómo se abre
// el recorrido en una app de mapas. El servidor vuelve a validar todo.

import type {
  DeliveryRouteStatus,
  FailureReason,
  RouteEventType,
} from './api/delivery-routes';
import type { DeliveryNoteStatus } from './api/logistics';
import { formatMinutes, isLocated, type Point } from './route-plan';

export const ROUTE_STATUS_LABELS: Record<DeliveryRouteStatus, string> = {
  OPEN: 'Por salir',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export const FAILURE_REASON_LABELS: Record<FailureReason, string> = {
  ABSENT: 'No había nadie para recibir',
  WRONG_ADDRESS: 'La dirección es incorrecta',
  REJECTED: 'El cliente rechazó el pedido',
  OTHER: 'Otro motivo',
};

/** Quién mira la ruta. */
export interface RouteViewer {
  /** Arma rutas: suma, saca, ordena, cambia repartidor y fecha. */
  canPlan: boolean;
  /** Logística con manejo total: puede iniciar y cerrar paradas por el repartidor. */
  canManage: boolean;
  /** Es el repartidor de esta ruta. */
  isDriver: boolean;
}

export interface RouteActions {
  /** Sumar, sacar o mover entregas y cambiar repartidor o fecha. */
  plan: boolean;
  /** Sumar entregas: también vale con la ruta ya en la calle. */
  addStops: boolean;
  reorder: boolean;
  start: boolean;
  /** Por qué todavía no se puede iniciar, cuando le tocaría poder. */
  startBlocked: string | null;
  cancel: boolean;
  /** Registrar que una parada no se pudo entregar. */
  failStops: boolean;
}

export function routeActions(
  route: { status: DeliveryRouteStatus; date: string; stops: number; hasDriver: boolean },
  viewer: RouteViewer,
  today: string,
): RouteActions {
  const open = route.status === 'OPEN';
  const onTheRoad = route.status === 'IN_PROGRESS';
  const runsIt = viewer.canManage || viewer.isDriver;

  let startBlocked: string | null = null;
  if (open && runsIt) {
    if (!route.hasDriver) startBlocked = 'La ruta no tiene repartidor.';
    else if (route.stops === 0) startBlocked = 'La ruta no tiene entregas para llevar.';
    else if (route.date > today) startBlocked = 'La ruta está armada para otro día.';
  }

  return {
    plan: open && viewer.canPlan,
    addStops: (open || onTheRoad) && viewer.canPlan && route.hasDriver,
    reorder: (open || onTheRoad) && viewer.canPlan,
    start: open && runsIt && startBlocked === null,
    startBlocked,
    cancel: open && viewer.canPlan,
    failStops: onTheRoad && runsIt,
  };
}

export interface RouteProgress {
  total: number;
  delivered: number;
  onTheWay: number;
  pending: number;
}

export function routeProgress(stops: { status: DeliveryNoteStatus }[]): RouteProgress {
  const count = (status: DeliveryNoteStatus) =>
    stops.filter((stop) => stop.status === status).length;
  return {
    total: stops.length,
    delivered: count('DELIVERED'),
    onTheWay: count('DISPATCHED'),
    pending: count('PENDING'),
  };
}

/** "3 de 5 entregadas" */
export function progressLabel(progress: Pick<RouteProgress, 'total' | 'delivered'>): string {
  if (progress.total === 0) return 'Sin entregas';
  return `${progress.delivered} de ${progress.total} ${progress.total === 1 ? 'entregada' : 'entregadas'}`;
}

/** Cuánto duró la ruta en la calle; null si no salió o no terminó. */
export function routeDuration(startedAt: string | null, finishedAt: string | null): string | null {
  if (!startedAt || !finishedAt) return null;
  const minutes = (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60_000;
  return minutes < 0 ? null : formatMinutes(minutes);
}

/** Lo que pasó, en una frase, para el historial de la ruta. */
export function routeEventText(event: {
  type: RouteEventType;
  detail: string | null;
  reason: string | null;
}): string {
  const who = event.detail ?? 'una entrega';
  switch (event.type) {
    case 'CREATED':
      return 'Se creó la ruta';
    case 'STOP_ADDED':
      return `Se sumó la entrega de ${who}`;
    case 'STOP_REMOVED':
      return `Salió de la ruta la entrega de ${who}`;
    case 'REORDERED':
      return 'Se cambió el orden de las paradas';
    case 'DRIVER_CHANGED':
      return event.detail ? `Cambió el repartidor: ${lowerFirst(event.detail)}` : 'Cambió el repartidor';
    case 'DATE_CHANGED':
      return event.detail ? `Cambió la fecha: ${lowerFirst(event.detail)}` : 'Cambió la fecha';
    case 'STARTED':
      return 'La ruta salió';
    case 'STOP_DELIVERED':
      return `Se entregó el pedido de ${who}`;
    case 'STOP_FAILED':
      return `No se pudo entregar a ${who}${event.reason ? `: ${lowerFirst(event.reason)}` : ''}`;
    case 'COMPLETED':
      return 'La ruta finalizó';
    case 'CANCELLED':
      return 'Se canceló la ruta';
    case 'CHECKPOINT':
      return event.detail
        ? `Toda la ruta: ${lowerFirst(event.detail)}`
        : 'Se actualizó el estado de toda la ruta';
  }
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

// ── Abrir en una app de mapas ───────────────────────────────────────────────

export interface Destination extends Point {
  address: string | null;
}

export interface MapLinks {
  google: string;
  /** Waze solo navega a una coordenada. */
  waze: string | null;
}

const coordinates = (point: { latitude: number; longitude: number }) =>
  `${point.latitude},${point.longitude}`;

/**
 * Enlaces para navegar hasta un destino. Con ubicación se usa la coordenada;
 * sin ella, la dirección escrita. Null si no hay ni una ni otra.
 */
export function mapLinks(destination: Destination): MapLinks | null {
  if (isLocated(destination)) {
    const where = coordinates(destination);
    return {
      google: `https://www.google.com/maps/dir/?api=1&destination=${where}&travelmode=driving`,
      waze: `https://waze.com/ul?ll=${where}&navigate=yes`,
    };
  }
  const address = destination.address?.trim();
  if (!address) return null;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`,
    waze: null,
  };
}

// Google Maps acepta hasta 9 paradas intermedias en un enlace.
const MAX_WAYPOINTS = 9;

export interface RouteMapLink {
  url: string;
  /** Paradas que no entraron en el enlace (sin ubicación ni dirección, o de más). */
  left: number;
}

/**
 * Un solo enlace de Google Maps con todas las paradas en orden, saliendo de
 * donde esté quien lo abre. Null si ninguna parada se puede ubicar.
 */
export function routeMapLink(stops: Destination[]): RouteMapLink | null {
  const places = stops
    .map((stop) =>
      isLocated(stop) ? coordinates(stop) : stop.address?.trim() || null,
    )
    .filter((place): place is string => place !== null);
  if (places.length === 0) return null;

  const shown = places.slice(0, MAX_WAYPOINTS + 1);
  const destination = shown[shown.length - 1];
  const waypoints = shown.slice(0, -1);
  const params = [
    'api=1',
    `destination=${encodeURIComponent(destination)}`,
    ...(waypoints.length > 0
      ? [`waypoints=${waypoints.map(encodeURIComponent).join('%7C')}`]
      : []),
    'travelmode=driving',
  ];
  return {
    url: `https://www.google.com/maps/dir/?${params.join('&')}`,
    left: stops.length - shown.length,
  };
}
