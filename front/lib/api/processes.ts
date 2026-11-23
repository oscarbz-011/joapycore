import { apiClient } from './client';

export type FailedProcessKind = 'STUCK' | 'NOT_RETRIED';

export type FailedProcessDocumentType =
  | 'invoice'
  | 'credit-note'
  | 'remission-note'
  | 'purchase-order'
  | 'delivery-note'
  | 'sale-order'
  | 'customer';

export interface FailedProcess {
  eventId: string;
  eventName: string;
  /** Null: el evento falló antes de llegar a sus procesos. */
  consumer: string | null;
  kind: FailedProcessKind;
  error: string | null;
  attempts: number;
  occurredAt: string;
  failedAt: string;
  document: { type: FailedProcessDocumentType; id: string } | null;
}

export const FAILED_PROCESSES_PATH = '/dashboard/settings/processes';

export const processesApi = {
  listFailed: (): Promise<FailedProcess[]> =>
    apiClient.get('/processes/failed').then((r) => r.data),
  countFailed: (): Promise<{ count: number }> =>
    apiClient.get('/processes/failed/count').then((r) => r.data),
  retry: (eventId: string, consumer: string | null): Promise<{ resolved: boolean }> =>
    apiClient
      .post(`/processes/failed/${eventId}/retry`, consumer ? { consumer } : {})
      .then((r) => r.data),
};
