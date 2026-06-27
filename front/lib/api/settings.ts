import { apiClient } from './client';

export type MarkupMethod = 'PERCENTAGE' | 'FIXED';

export interface PricingConfig {
  id: string;
  tenantId: string;
  markupMethod: MarkupMethod;
  defaultMarkup: number;
}

export interface CreditPlan {
  id: string;
  installments: number;
  interestRate: number;
  isActive: boolean;
}

export interface CreditConfig {
  id: string;
  tenantId: string;
  isEnabled: boolean;
  plans: CreditPlan[];
}

export const settingsApi = {
  // ── Pricing ──────────────────────────────────────────────────────────────────
  getPricing: (): Promise<PricingConfig | null> =>
    apiClient.get('/tenants/me/pricing').then((r) => r.data),

  upsertPricing: (dto: {
    markupMethod: MarkupMethod;
    defaultMarkup: number;
  }): Promise<PricingConfig> =>
    apiClient.put('/tenants/me/pricing', dto).then((r) => r.data),

  // ── Credit ───────────────────────────────────────────────────────────────────
  getCredit: (): Promise<CreditConfig | null> =>
    apiClient.get('/tenants/me/credit').then((r) => r.data),

  setCreditEnabled: (isEnabled: boolean): Promise<CreditConfig> =>
    apiClient.put('/tenants/me/credit', { isEnabled }).then((r) => r.data),

  addCreditPlan: (dto: {
    installments: number;
    interestRate: number;
  }): Promise<CreditPlan> =>
    apiClient.post('/tenants/me/credit/plans', dto).then((r) => r.data),

  updateCreditPlan: (
    id: string,
    dto: { interestRate?: number; isActive?: boolean },
  ): Promise<CreditPlan> =>
    apiClient.patch(`/tenants/me/credit/plans/${id}`, dto).then((r) => r.data),

  removeCreditPlan: (id: string): Promise<void> =>
    apiClient.delete(`/tenants/me/credit/plans/${id}`).then(() => undefined),
};
