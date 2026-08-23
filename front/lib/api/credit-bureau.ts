import { apiClient } from './client';

export type CreditBureauCheckFrequency = 'FIRST_PURCHASE_ONLY' | 'EVERY_REQUEST';
export type CreditBureauCheckResult = 'CLEAN' | 'FLAGGED';

export interface CreditBureauConfig {
  isEnabled: boolean;
  checkFrequency: CreditBureauCheckFrequency;
  providerName: string;
}

export interface RecordBureauCheckPayload {
  customerId: string;
  saleOrderId?: string;
  result: CreditBureauCheckResult;
  notes?: string;
}

export const creditBureauApi = {
  getConfig: (): Promise<CreditBureauConfig> =>
    apiClient.get('/credit-bureau/config').then((r) => r.data),

  updateConfig: (dto: {
    isEnabled: boolean;
    checkFrequency: CreditBureauCheckFrequency;
  }): Promise<CreditBureauConfig> =>
    apiClient.patch('/credit-bureau/config', dto).then((r) => r.data),

  recordCheck: (dto: RecordBureauCheckPayload): Promise<unknown> =>
    apiClient.post('/credit-bureau/checks', dto).then((r) => r.data),
};
