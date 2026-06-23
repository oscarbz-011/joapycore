import { apiClient } from './client';

export type AlertType = 'STOCK_LOW' | 'PAYMENT_DUE' | 'INVOICE_OVERDUE';
export type AlertChannel = 'EMAIL' | 'SYSTEM';

export interface AlertConfig {
  id: string;
  tenantId: string;
  type: AlertType;
  channel: AlertChannel;
  isActive: boolean;
  threshold: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAlertPayload {
  type: AlertType;
  channel?: AlertChannel;
  isActive?: boolean;
  threshold?: number;
}

export const alertsApi = {
  getConfigs: (): Promise<AlertConfig[]> =>
    apiClient.get('/alerts/configs').then((r) => r.data),

  upsert: (dto: UpsertAlertPayload): Promise<AlertConfig> =>
    apiClient.post('/alerts/configs', dto).then((r) => r.data),
};
