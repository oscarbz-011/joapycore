import { apiClient } from './client';
import type { DeliveryNoteStatus } from './logistics';
import type { DeliveryShift } from '../route-plan';

/** Una entrega tal como la ve la planificación de rutas. */
export interface RouteStop {
  id: string;
  noteNumber: string | null;
  status: DeliveryNoteStatus;
  routeId: string | null;
  /** Día para el que está programada (AAAA-MM-DD), si tiene. */
  scheduledDate: string | null;
  scheduledShift: DeliveryShift | null;
  saleOrderId: string;
  /** Unidades del pedido, sumando todos sus productos. */
  units: number;
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

export interface DeliveryRoute {
  id: string;
  date: string;
  shift: DeliveryShift;
  name: string | null;
  vehicle: string | null;
  driver: { id: string; firstName: string; lastName: string } | null;
  stops: RouteStop[];
}

export interface RouteBoard {
  date: string;
  routes: DeliveryRoute[];
  /** Entregas a domicilio pendientes que no están en ninguna ruta. */
  unplanned: RouteStop[];
}

export interface CreateRoutePayload {
  date: string;
  shift: DeliveryShift;
  driverEmployeeId?: string;
  vehicle?: string;
  name?: string;
}

const BASE = '/logistics/delivery-routes';

export const deliveryRoutesApi = {
  board: (date: string): Promise<RouteBoard> =>
    apiClient.get(`${BASE}/board`, { params: { date } }).then((r) => r.data),

  create: (dto: CreateRoutePayload): Promise<DeliveryRoute> =>
    apiClient.post(BASE, dto).then((r) => r.data),

  update: (
    id: string,
    dto: { driverEmployeeId?: string | null; vehicle?: string; name?: string },
  ): Promise<DeliveryRoute> => apiClient.patch(`${BASE}/${id}`, dto).then((r) => r.data),

  remove: (id: string): Promise<{ id: string }> =>
    apiClient.delete(`${BASE}/${id}`).then((r) => r.data),

  /** Suma la entrega a la ruta (o la trae de otra) en el lugar indicado. */
  addStop: (id: string, deliveryNoteId: string, position?: number): Promise<DeliveryRoute> =>
    apiClient.post(`${BASE}/${id}/stops`, { deliveryNoteId, position }).then((r) => r.data),

  reorder: (id: string, deliveryNoteIds: string[]): Promise<DeliveryRoute> =>
    apiClient.post(`${BASE}/${id}/order`, { deliveryNoteIds }).then((r) => r.data),

  removeStop: (noteId: string): Promise<{ id: string }> =>
    apiClient.post(`${BASE}/stops/${noteId}/unassign`, {}).then((r) => r.data),

  /** Programa la entrega para otro día o turno; si estaba en una ruta, sale. */
  schedule: (
    noteId: string,
    dto: { date: string | null; shift?: DeliveryShift | null },
  ): Promise<{ id: string }> =>
    apiClient.post(`${BASE}/stops/${noteId}/schedule`, dto).then((r) => r.data),
};
