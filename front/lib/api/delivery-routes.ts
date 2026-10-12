import { apiClient } from './client';
import type { DeliveryNoteStatus } from './logistics';

export type DeliveryRouteStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type RouteEventType =
  | 'CREATED'
  | 'STOP_ADDED'
  | 'STOP_REMOVED'
  | 'REORDERED'
  | 'DRIVER_CHANGED'
  | 'DATE_CHANGED'
  | 'STARTED'
  | 'STOP_DELIVERED'
  | 'STOP_FAILED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'CHECKPOINT';

export type FailureReason = 'ABSENT' | 'WRONG_ADDRESS' | 'REJECTED' | 'OTHER';

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

/** Una entrega vista como parada de una ruta. */
export interface RouteStop {
  id: string;
  noteNumber: string | null;
  status: DeliveryNoteStatus;
  routeId: string | null;
  deliveredAt: string | null;
  saleOrderId: string;
  /** Unidades del pedido, sumando todos sus productos. */
  units: number;
  items: { name: string; quantity: number }[];
  customer: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    reference: string | null;
    latitude: number | null;
    longitude: number | null;
  };
}

export interface RouteSummary {
  id: string;
  /** RUT-26-000001 */
  code: string;
  /** Día de salida (AAAA-MM-DD). */
  date: string;
  status: DeliveryRouteStatus;
  vehicle: string | null;
  driver: Person | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface RouteListItem extends RouteSummary {
  stops: number;
  delivered: number;
}

export interface DeliveryRoute extends RouteSummary {
  stops: RouteStop[];
}

export interface RouteEvent {
  id: string;
  type: RouteEventType;
  detail: string | null;
  reason: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  user: Person | null;
}

export interface DeliveryRouteDetail extends DeliveryRoute {
  events: RouteEvent[];
}

export interface RoutePage {
  items: RouteListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RouteListQuery {
  status?: DeliveryRouteStatus;
  driverEmployeeId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface FailDeliveryPayload {
  reason: FailureReason;
  note?: string;
  latitude?: number;
  longitude?: number;
}

const BASE = '/logistics/delivery-routes';

export const deliveryRoutesApi = {
  list: (query: RouteListQuery): Promise<RoutePage> =>
    apiClient.get(BASE, { params: query }).then((r) => r.data),

  get: (id: string): Promise<DeliveryRouteDetail> =>
    apiClient.get(`${BASE}/${id}`).then((r) => r.data),

  /** Las rutas del repartidor que todavía no terminaron. */
  mine: (): Promise<DeliveryRoute[]> => apiClient.get(`${BASE}/mine`).then((r) => r.data),

  /** Entregas a domicilio pendientes que no están en ninguna ruta. */
  unplanned: (): Promise<RouteStop[]> => apiClient.get(`${BASE}/unplanned`).then((r) => r.data),

  update: (
    id: string,
    dto: { driverEmployeeId?: string; vehicle?: string; date?: string },
  ): Promise<DeliveryRouteDetail> => apiClient.patch(`${BASE}/${id}`, dto).then((r) => r.data),

  start: (id: string, vehicle?: string): Promise<DeliveryRouteDetail> =>
    apiClient.post(`${BASE}/${id}/start`, { vehicle }).then((r) => r.data),

  /** Marca un hito para todas las entregas en camino de la ruta. */
  checkpoint: (
    id: string,
    checkpoint: 'LEFT_WAREHOUSE' | 'IN_TRANSIT',
  ): Promise<{ id: string; marked: number }> =>
    apiClient.post(`${BASE}/${id}/checkpoint`, { checkpoint }).then((r) => r.data),

  // La parada de un cliente: todos sus pedidos de la ruta a la vez.
  deliverCustomer: (
    id: string,
    customerId: string,
    dto: { latitude?: number; longitude?: number; locationConfirmed?: boolean },
  ): Promise<{ delivered: number }> =>
    apiClient.post(`${BASE}/${id}/customers/${customerId}/deliver`, dto).then((r) => r.data),

  checkpointCustomer: (
    id: string,
    customerId: string,
    checkpoint: 'LEFT_WAREHOUSE' | 'IN_TRANSIT' | 'ARRIVED',
  ): Promise<{ marked: number }> =>
    apiClient
      .post(`${BASE}/${id}/customers/${customerId}/checkpoint`, { checkpoint })
      .then((r) => r.data),

  failCustomer: (
    id: string,
    customerId: string,
    dto: FailDeliveryPayload,
  ): Promise<{ failed: number }> =>
    apiClient.post(`${BASE}/${id}/customers/${customerId}/fail`, dto).then((r) => r.data),

  cancel: (id: string): Promise<DeliveryRouteDetail> =>
    apiClient.post(`${BASE}/${id}/cancel`, {}).then((r) => r.data),

  /** Suma la entrega a la ruta (o la trae de otra) en el lugar indicado. */
  addStop: (id: string, deliveryNoteId: string, position?: number): Promise<DeliveryRouteDetail> =>
    apiClient.post(`${BASE}/${id}/stops`, { deliveryNoteId, position }).then((r) => r.data),

  reorder: (id: string, deliveryNoteIds: string[]): Promise<DeliveryRouteDetail> =>
    apiClient.post(`${BASE}/${id}/order`, { deliveryNoteIds }).then((r) => r.data),

  removeStop: (noteId: string): Promise<{ id: string }> =>
    apiClient.post(`${BASE}/stops/${noteId}/unassign`, {}).then((r) => r.data),

  /** No se pudo entregar: la entrega vuelve a pendiente, sin ruta. */
  failStop: (noteId: string, dto: FailDeliveryPayload): Promise<{ id: string }> =>
    apiClient.post(`${BASE}/stops/${noteId}/fail`, dto).then((r) => r.data),
};
