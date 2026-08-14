import { apiClient } from './client';

export type DeliveryNoteStatus = 'PENDING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';

export interface DeliveryNoteItem {
  id: string;
  quantity: number;
  unitPrice: number;
  product: { id: string; name: string; isSerialized: boolean };
}

export interface DeliveryNote {
  id: string;
  status: DeliveryNoteStatus;
  carrier: string | null;
  vehicle: string | null;
  notes: string | null;
  issuedAt: string;
  deliveredAt: string | null;
  createdAt: string;
  saleOrder: {
    id: string;
    code: string;
    saleType: 'CASH' | 'CREDIT';
    deliveryAddress: string | null;
    customer: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string | null;
    };
    items: DeliveryNoteItem[];
  };
}

export interface DispatchDeliveryPayload {
  carrier?: string;
  vehicle?: string;
  notes?: string;
}

export const STATUS_LABELS: Record<DeliveryNoteStatus, string> = {
  PENDING: 'Pendiente',
  DISPATCHED: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
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
};
