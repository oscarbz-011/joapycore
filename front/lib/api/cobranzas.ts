import { apiClient } from './client';

// ── Enums ──────────────────────────────────────────────────────────────────────
export type CollectionRouteStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';
export type VisitResult = 'COLLECTED' | 'PARTIAL' | 'ABSENT' | 'REFUSED' | 'PROMISE';
export type AgreementStatus = 'ACTIVE' | 'FULFILLED' | 'BROKEN' | 'CANCELLED';
export type CollectionNoteType = 'VISIT' | 'CALL' | 'MESSAGE' | 'GENERAL';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface CollectionVisit {
  id: string;
  routeId: string;
  customerId: string;
  loanId?: string | null;
  installmentId?: string | null;
  arId?: string | null;
  plannedAmount: number;
  collectedAmount: number;
  result?: VisitResult | null;
  promiseDate?: string | null;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
  visitedAt?: string | null;
  visitOrder: number;
  customer: { id: string; firstName: string; lastName: string; phone?: string | null; address?: string | null };
  installment?: { id: string; number: number; dueDate: string; amount: number; status: string } | null;
  loan?: { id: string; totalAmount: number; totalInstallments: number } | null;
}

export interface CollectionRoute {
  id: string;
  routeDate: string;
  collectorId?: string | null;
  status: CollectionRouteStatus;
  totalPlanned: number;
  totalCollected: number;
  notes?: string | null;
  closedAt?: string | null;
  createdAt: string;
  collector?: { id: string; firstName: string; lastName: string } | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  visits: CollectionVisit[];
}

export interface PaymentAgreement {
  id: string;
  customerId: string;
  loanId?: string | null;
  originalDebt: number;
  agreedInstallments: number;
  agreedAmount: number;
  startDate: string;
  status: AgreementStatus;
  notes?: string | null;
  approvedById?: string | null;
  createdAt: string;
  customer: { id: string; firstName: string; lastName: string; documentNumber: string };
  loan?: { id: string; principal: number; totalAmount: number } | null;
  approvedBy?: { id: string; firstName: string; lastName: string } | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface CollectionNote {
  id: string;
  customerId: string;
  note: string;
  type: CollectionNoteType;
  createdAt: string;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface CollectionsKpi {
  openRoutes: number;
  routesToday: number;
  activeAgreements: number;
  overdueInstallments: number;
  totalCollected: number;
}

// ── Payloads ───────────────────────────────────────────────────────────────────
export interface CreateRoutePayload {
  routeDate: string;
  collectorId?: string;
  notes?: string;
}

export interface AddVisitPayload {
  customerId: string;
  plannedAmount: number;
  loanId?: string;
  installmentId?: string;
  arId?: string;
  visitOrder?: number;
}

export interface UpdateVisitResultPayload {
  result: VisitResult;
  collectedAmount?: number;
  paymentMethod?: string;
  reference?: string;
  promiseDate?: string;
  notes?: string;
}

export interface CreateAgreementPayload {
  customerId: string;
  loanId?: string;
  originalDebt: number;
  agreedInstallments: number;
  agreedAmount: number;
  startDate: string;
  notes?: string;
}

export interface AddNotePayload {
  customerId: string;
  note: string;
  type?: CollectionNoteType;
}

// ── API ────────────────────────────────────────────────────────────────────────
export const cobranzasApi = {
  // KPIs
  getKpis: (): Promise<CollectionsKpi> =>
    apiClient.get('/collections/kpis').then((r) => r.data),

  // Routes
  listRoutes: (params?: { collectorId?: string; status?: string }): Promise<CollectionRoute[]> =>
    apiClient.get('/collections/routes', { params }).then((r) => r.data),

  getRoute: (id: string): Promise<CollectionRoute> =>
    apiClient.get(`/collections/routes/${id}`).then((r) => r.data),

  createRoute: (dto: CreateRoutePayload): Promise<CollectionRoute> =>
    apiClient.post('/collections/routes', dto).then((r) => r.data),

  addVisit: (routeId: string, dto: AddVisitPayload): Promise<CollectionVisit> =>
    apiClient.post(`/collections/routes/${routeId}/visits`, dto).then((r) => r.data),

  removeVisit: (routeId: string, visitId: string): Promise<{ removed: boolean }> =>
    apiClient.delete(`/collections/routes/${routeId}/visits/${visitId}`).then((r) => r.data),

  recordVisitResult: (routeId: string, visitId: string, dto: UpdateVisitResultPayload): Promise<CollectionVisit> =>
    apiClient.patch(`/collections/routes/${routeId}/visits/${visitId}/result`, dto).then((r) => r.data),

  closeRoute: (id: string): Promise<CollectionRoute> =>
    apiClient.post(`/collections/routes/${id}/close`).then((r) => r.data),

  cancelRoute: (id: string): Promise<CollectionRoute> =>
    apiClient.post(`/collections/routes/${id}/cancel`).then((r) => r.data),

  // Agreements
  listAgreements: (params?: { customerId?: string }): Promise<PaymentAgreement[]> =>
    apiClient.get('/collections/agreements', { params }).then((r) => r.data),

  getAgreement: (id: string): Promise<PaymentAgreement> =>
    apiClient.get(`/collections/agreements/${id}`).then((r) => r.data),

  createAgreement: (dto: CreateAgreementPayload): Promise<PaymentAgreement> =>
    apiClient.post('/collections/agreements', dto).then((r) => r.data),

  approveAgreement: (id: string): Promise<PaymentAgreement> =>
    apiClient.post(`/collections/agreements/${id}/approve`).then((r) => r.data),

  updateAgreementStatus: (id: string, status: 'FULFILLED' | 'BROKEN' | 'CANCELLED'): Promise<PaymentAgreement> =>
    apiClient.patch(`/collections/agreements/${id}/status`, { status }).then((r) => r.data),

  // Notes
  getNotesByCustomer: (customerId: string): Promise<CollectionNote[]> =>
    apiClient.get(`/collections/customers/${customerId}/notes`).then((r) => r.data),

  addNote: (dto: AddNotePayload): Promise<CollectionNote> =>
    apiClient.post('/collections/customers/notes', dto).then((r) => r.data),
};
