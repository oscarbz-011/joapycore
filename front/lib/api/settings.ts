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
  // % máximo del sueldo del cliente admitido para la cuota de un crédito.
  // null = sin tope (no se bloquea la aprobación por capacidad de pago).
  maxIncomePercentage: number | null;
  // Día del mes (1-28) en que vencen todas las cuotas de crédito del tenant.
  dueDayOfMonth: number;
  // Días de tolerancia después del vencimiento antes de empezar a cobrar mora.
  moraGraceDays: number;
  plans: CreditPlan[];
}

export interface SalesConfig {
  id: string;
  tenantId: string;
  combosEnabled: boolean;
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

  setCreditEnabled: (
    isEnabled: boolean,
    maxIncomePercentage?: number | null,
    dueDayOfMonth?: number,
    moraGraceDays?: number,
  ): Promise<CreditConfig> =>
    apiClient.put('/tenants/me/credit', { isEnabled, maxIncomePercentage, dueDayOfMonth, moraGraceDays }).then((r) => r.data),

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

  // ── Sales ────────────────────────────────────────────────────────────────────
  getSalesConfig: (): Promise<SalesConfig | null> =>
    apiClient.get('/tenants/me/sales-config').then((r) => r.data),

  setCombosEnabled: (combosEnabled: boolean): Promise<SalesConfig> =>
    apiClient.put('/tenants/me/sales-config', { combosEnabled }).then((r) => r.data),
};
