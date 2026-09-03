import { apiClient } from './client';
import type { Customer } from './sales';

export type DeliveryNoteStatus = 'PENDING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
export type DeliveryAssignmentMode = 'INTERNAL_EMPLOYEE' | 'EXTERNAL_COURIER_USER' | 'EXTERNAL_COMPANY';
export type DeliveryCheckpoint = 'LEFT_WAREHOUSE' | 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED';

export interface DeliveryNoteItem {
  id: string;
  quantity: number;
  unitPrice: number;
  // Precio con interés de crédito ya aplicado — presente solo en ítems de
  // ventas a crédito. Usar este valor en vez de unitPrice cuando esté
  // presente (ver saleOrder.saleType).
  financedUnitPrice: number | null;
  product: { id: string; name: string; isSerialized: boolean };
}

export interface AssignedEmployee {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  mobilePhone: string | null;
  contractType: 'PERMANENT' | 'TEMPORARY' | 'PART_TIME' | 'CONTRACTOR';
}

export interface DeliveryTrackingEvent {
  id: string;
  source: 'MANUAL' | 'GPS_AUTO';
  checkpoint: DeliveryCheckpoint | null;
  latitude: number | null;
  longitude: number | null;
  locationConfirmed: boolean | null;
  notes: string | null;
  recordedAt: string;
  recordedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface DeliveryNote {
  id: string;
  status: DeliveryNoteStatus;
  carrier: string | null;
  vehicle: string | null;
  notes: string | null;
  assignmentMode: DeliveryAssignmentMode | null;
  assignedEmployee: AssignedEmployee | null;
  externalTrackingRef: string | null;
  issuedAt: string;
  deliveredAt: string | null;
  createdAt: string;
  trackingEvents: DeliveryTrackingEvent[];
  saleOrder: {
    id: string;
    saleType: 'CASH' | 'CREDIT';
    seller: { id: string; firstName: string; lastName: string } | null;
    customer: Customer;
    items: DeliveryNoteItem[];
  };
}

export interface DispatchDeliveryPayload {
  carrier?: string;
  vehicle?: string;
  notes?: string;
}

export interface CourierOption {
  id: string;
  firstName: string;
  lastName: string;
  contractType: 'PERMANENT' | 'TEMPORARY' | 'PART_TIME' | 'CONTRACTOR';
  userId: string | null;
  phone: string | null;
  mobilePhone: string | null;
}

export interface AssignDeliveryPayload {
  assignmentMode: DeliveryAssignmentMode;
  assignedEmployeeId?: string;
  carrier?: string;
  externalTrackingRef?: string;
}

export interface RecordTrackingEventPayload {
  checkpoint?: DeliveryCheckpoint;
  latitude?: number;
  longitude?: number;
  locationConfirmed?: boolean;
  notes?: string;
}

export const STATUS_LABELS: Record<DeliveryNoteStatus, string> = {
  PENDING: 'Pendiente',
  DISPATCHED: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

export const ASSIGNMENT_MODE_LABELS: Record<DeliveryAssignmentMode, string> = {
  INTERNAL_EMPLOYEE: 'Empleado interno',
  EXTERNAL_COURIER_USER: 'Repartidor externo (con usuario)',
  EXTERNAL_COMPANY: 'Empresa de courier',
};

export const CHECKPOINT_LABELS: Record<DeliveryCheckpoint, string> = {
  LEFT_WAREHOUSE: 'Salió del depósito',
  IN_TRANSIT: 'En camino',
  ARRIVED: 'Llegó al destino',
  DELIVERED: 'Entregado',
};

export const logisticsApi = {
  listDeliveries: (status?: DeliveryNoteStatus): Promise<DeliveryNote[]> =>
    apiClient
      .get('/logistics/deliveries', { params: status ? { status } : undefined })
      .then((r) => r.data),

  getDelivery: (id: string): Promise<DeliveryNote> =>
    apiClient.get(`/logistics/deliveries/${id}`).then((r) => r.data),

  dispatch: (id: string, dto: DispatchDeliveryPayload): Promise<DeliveryNote> =>
    apiClient.patch(`/logistics/deliveries/${id}/dispatch`, dto).then((r) => r.data),

  markDelivered: (id: string): Promise<DeliveryNote> =>
    apiClient.patch(`/logistics/deliveries/${id}/deliver`, {}).then((r) => r.data),

  // Asignación
  listCouriers: (): Promise<CourierOption[]> =>
    apiClient.get('/logistics/couriers').then((r) => r.data),

  assign: (id: string, dto: AssignDeliveryPayload): Promise<DeliveryNote> =>
    apiClient.patch(`/logistics/deliveries/${id}/assign`, dto).then((r) => r.data),

  // Vista del repartidor
  listMine: (status?: DeliveryNoteStatus): Promise<DeliveryNote[]> =>
    apiClient
      .get('/logistics/deliveries/mine', { params: status ? { status } : undefined })
      .then((r) => r.data),

  recordTrackingEvent: (id: string, dto: RecordTrackingEventPayload): Promise<DeliveryTrackingEvent> =>
    apiClient.post(`/logistics/deliveries/${id}/tracking-events`, dto).then((r) => r.data),

  listTrackingEvents: (id: string): Promise<DeliveryTrackingEvent[]> =>
    apiClient.get(`/logistics/deliveries/${id}/tracking-events`).then((r) => r.data),
};
