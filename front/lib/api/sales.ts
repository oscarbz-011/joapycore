import { apiClient } from './client';

export type DocumentType = 'CI' | 'RUC' | 'PASSPORT';
export type SaleType = 'CASH' | 'CREDIT';
export type OrderType = 'STANDARD' | 'QUOTE' | 'WHOLESALE';
export type MarkupType = 'PERCENTAGE' | 'FIXED';
export type SaleOrderStatus =
  | 'QUOTED'
  | 'PENDING'
  | 'PENDING_CREDIT_APPROVAL'
  | 'CREDIT_APPROVED'
  | 'CREDIT_REJECTED'
  | 'CREDIT_NEEDS_ADJUSTMENT'
  | 'CONFIRMED'
  | 'PAYMENT_RECEIVED'
  | 'DELIVERED'
  | 'INVOICED'
  | 'CANCELLED';

export type ComboPriceMode = 'FIXED' | 'SUM_WITH_DISCOUNT';
export type CreditAdjustmentSuggestion = 'LOWER_VALUE_PRODUCT' | 'MORE_INSTALLMENTS' | 'ADD_GUARANTOR';
export type CreditRating = 'SIN_HISTORIAL' | 'BUENO' | 'REGULAR' | 'RIESGO';
export type CreditBureauCheckResult = 'CLEAN' | 'FLAGGED';
export type EconomicActivity = 'ASALARIADO' | 'FUNCIONARIO_PUBLICO' | 'PROFESIONAL_INDEPENDIENTE' | 'COMERCIANTE';

export interface Guarantor {
  id: string;
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  monthlyIncome: number | null;
  createdAt: string;
}

export interface ActiveLoanSummary {
  loanId: string;
  productNames: string[];
  totalAmount: number;
  outstandingBalance: number;
  monthlyInstallment: number;
  installmentsPaid: number;
  totalInstallments: number;
  startDate: string;
  firstDueDate: string | null;
  finalDueDate: string | null;
  nextDueDate: string | null;
}

export interface CreditHistory {
  rating: CreditRating;
  activeLoans: ActiveLoanSummary[];
  overdueCount: number;
  overdueAmount: number;
}

export interface IncomeCapacity {
  applicable: boolean;
  // Ingreso del cliente solo, sin sumar garantes.
  customerIncome: number | null;
  // Suma de los ingresos declarados de los garantes del pedido (0 si no
  // tiene garantes o ninguno declaró ingreso).
  guarantorIncome: number;
  // Ingreso combinado (customerIncome + guarantorIncome) — es el que se
  // usa para calcular maxAllowed.
  monthlyIncome: number | null;
  maxIncomePercentage: number | null;
  maxAllowed: number | null;
  currentCommitment: number;
  proposedMonthlyPayment: number;
  available: number | null;
  exceeds: boolean;
}

export interface BureauCheckStatus {
  required: boolean;
  latestResult: CreditBureauCheckResult | null;
}

export interface CreditEvaluation {
  proposedMonthlyPayment: number;
  history: CreditHistory;
  capacity: IncomeCapacity;
  bureau: BureauCheckStatus;
}

export interface RequestAdjustmentPayload {
  suggestedAlternatives: CreditAdjustmentSuggestion[];
  note?: string;
}

export interface CreateGuarantorPayload {
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  phone?: string;
  email?: string;
  address?: string;
  monthlyIncome?: number;
}

export interface Customer {
  id: string;
  customerCode: string | null;
  firstName: string;
  secondFirstName: string | null;
  lastName: string;
  secondLastName: string | null;
  documentType: DocumentType | null;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  profession: string | null;
  monthlyIncome: number | null;
  notes: string | null;
  isActive: boolean;
  economicActivity: EconomicActivity | null;
  hasIpsInsurance: boolean | null;
  // Datos laborales
  employerName: string | null;
  supervisorName: string | null;
  workPhone: string | null;
  workAddress: string | null;
  workSeniority: string | null;
  // Structured delivery address
  homeStreet: string | null;
  homeNeighborhood: string | null;
  homeReference: string | null;
  aptBuilding: string | null;
  aptFloor: string | null;
  aptNumber: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface SaleOrderItem {
  id: string;
  productId: string | null;
  // Descripción libre — solo presente cuando productId es null (línea sin
  // catálogo, ej. ítem a medida en un presupuesto).
  description: string | null;
  quantity: number;
  unitPrice: number;
  // Precio con interés de crédito ya aplicado — solo presente en ítems de
  // ventas a crédito, resuelto server-side al crear el pedido.
  financedUnitPrice: number | null;
  ivaRate: number | null;
  ivaAmount: number | null;
  product: {
    id: string;
    name: string;
    model: string | null;
    isSerialized: boolean;
    usesLots: boolean;
    unit: string;
  } | null;
  productUnits: { id: string; serialNumber: string }[];
  batch: { id: string; batchNumber: string } | null;
  comboId: string | null;
  comboGroupId: string | null;
  specNotes: string | null;
}

export interface SaleOrder {
  id: string;
  status: SaleOrderStatus;
  orderType: OrderType;
  saleType: SaleType;
  installments: number | null;
  interestRate: number | null;
  orderDate: string;
  notes: string | null;
  quoteNumber: string | null;
  quotePdfFileId: string | null;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    documentNumber: string | null;
    documentType: DocumentType | null;
  };
  createdBy: { id: string; firstName: string; lastName: string } | null;
  seller:    { id: string; firstName: string; lastName: string } | null;
  approvedBy: { id: string; firstName: string; lastName: string } | null;
  rejectedBy: { id: string; firstName: string; lastName: string } | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  surchargeType: MarkupType | null;
  surchargeAmount: number | null;
  surchargeReason: string | null;
  adjustmentNote: string | null;
  suggestedAlternatives: CreditAdjustmentSuggestion[];
  guarantors: Guarantor[];
  items: SaleOrderItem[];
  invoice: { id: string; status: string } | null;
  loan: { totalAmount: number; interestRate: number } | null;
}

export interface CreateSaleOrderItem {
  // Opcional — un ítem sin producto es una línea libre (requiere description).
  productId?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  serialNumbers?: string[];
  batchId?: string;
  comboId?: string;
  comboGroupId?: string;
  specNotes?: string;
}

// ── Combos ──────────────────────────────────────────────────────────────────

export interface SaleComboItem {
  id: string;
  productId: string;
  quantity: number;
  product: { id: string; name: string; salePrice: number; isSerialized: boolean };
}

export interface SaleCombo {
  id: string;
  name: string;
  description: string | null;
  priceMode: ComboPriceMode;
  fixedPrice: number | null;
  discountPercentage: number | null;
  isActive: boolean;
  items: SaleComboItem[];
}

export interface ComboItemPayload {
  productId: string;
  quantity: number;
}

export interface CreateComboPayload {
  name: string;
  description?: string;
  priceMode: ComboPriceMode;
  fixedPrice?: number;
  discountPercentage?: number;
  items: ComboItemPayload[];
}

export type UpdateComboPayload = Partial<CreateComboPayload> & { isActive?: boolean };

export interface CreateSaleOrderPayload {
  customerId: string;
  sellerId?: string;
  orderType?: OrderType;
  saleType?: SaleType;
  installments?: number;
  notes?: string;
  items: CreateSaleOrderItem[];
  surchargeType?: MarkupType;
  surchargeAmount?: number;
  surchargeReason?: string;
}

export interface CreateCustomerPayload {
  firstName: string;
  secondFirstName?: string;
  lastName: string;
  secondLastName?: string;
  documentType?: DocumentType;
  documentNumber?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  profession?: string;
  monthlyIncome?: number;
  notes?: string;
  economicActivity?: EconomicActivity;
  hasIpsInsurance?: boolean;
  // Datos laborales
  employerName?: string;
  supervisorName?: string;
  workPhone?: string;
  workAddress?: string;
  workSeniority?: string;
  // Structured delivery address
  homeStreet?: string;
  homeNeighborhood?: string;
  homeReference?: string;
  aptBuilding?: string;
  aptFloor?: string;
  aptNumber?: string;
  latitude?: number;
  longitude?: number;
}

export type UpdateCustomerPayload = Partial<CreateCustomerPayload>;

// ── Sales targets / performance ────────────────────────────────────────────────

export interface SellerStat {
  seller: { id: string; firstName: string; lastName: string };
  actual: number;
  target: number | null;
  cashAmount: number;
  creditAmount: number;
  cashCount: number;
  creditCount: number;
}

export interface SalesPerformance {
  period: string;
  companyActual: number;
  companyTarget: number | null;
  sellers: SellerStat[];
  canManage: boolean;
}

export interface UpsertTargetPayload {
  period: string;
  targetAmount: number;
}

export const salesApi = {
  // Orders
  listOrders: (): Promise<SaleOrder[]> =>
    apiClient.get('/sales/orders').then((r) => r.data),

  getOrder: (id: string): Promise<SaleOrder> =>
    apiClient.get(`/sales/orders/${id}`).then((r) => r.data),

  createOrder: (dto: CreateSaleOrderPayload): Promise<SaleOrder> =>
    apiClient.post('/sales/orders', dto).then((r) => r.data),

  confirmOrder: (id: string): Promise<SaleOrder> =>
    apiClient.post(`/sales/orders/${id}/confirm`).then((r) => r.data),

  cancelOrder: (id: string): Promise<SaleOrder> =>
    apiClient.post(`/sales/orders/${id}/cancel`).then((r) => r.data),

  // Credit approval
  listPendingApprovals: (): Promise<SaleOrder[]> =>
    apiClient.get('/sales/orders/pending-approvals').then((r) => r.data),

  approveCredit: (id: string): Promise<SaleOrder> =>
    apiClient.post(`/sales/orders/${id}/approve`).then((r) => r.data),

  rejectCredit: (id: string, reason: string): Promise<SaleOrder> =>
    apiClient.post(`/sales/orders/${id}/reject`, { reason }).then((r) => r.data),

  getCreditEvaluation: (id: string): Promise<CreditEvaluation> =>
    apiClient.get(`/sales/orders/${id}/credit-evaluation`).then((r) => r.data),

  requestAdjustment: (id: string, dto: RequestAdjustmentPayload): Promise<SaleOrder> =>
    apiClient.post(`/sales/orders/${id}/request-adjustment`, dto).then((r) => r.data),

  addGuarantor: (id: string, dto: CreateGuarantorPayload): Promise<SaleOrder> =>
    apiClient.post(`/sales/orders/${id}/guarantors`, dto).then((r) => r.data),

  adjustOrder: (id: string, dto: { items?: CreateSaleOrderItem[]; installments?: number }): Promise<SaleOrder> =>
    apiClient.patch(`/sales/orders/${id}/adjust`, dto).then((r) => r.data),

  resubmitOrder: (id: string): Promise<SaleOrder> =>
    apiClient.post(`/sales/orders/${id}/resubmit`).then((r) => r.data),

  // Regenera el PDF de un presupuesto que quedó sin generar.
  retryQuotePdf: (id: string): Promise<SaleOrder> =>
    apiClient.post(`/sales/orders/${id}/quote-pdf/retry`).then((r) => r.data),

  convertQuote: (id: string): Promise<SaleOrder> =>
    apiClient.post(`/sales/orders/${id}/convert`).then((r) => r.data),

  deliverOrder: (id: string): Promise<SaleOrder> =>
    apiClient.post(`/sales/orders/${id}/deliver`).then((r) => r.data),

  // Customers
  listCustomers: (): Promise<Customer[]> =>
    apiClient.get('/sales/customers').then((r) => r.data),

  getCustomer: (id: string): Promise<Customer> =>
    apiClient.get(`/sales/customers/${id}`).then((r) => r.data),

  createCustomer: (dto: CreateCustomerPayload): Promise<Customer> =>
    apiClient.post('/sales/customers', dto).then((r) => r.data),

  updateCustomer: (id: string, dto: UpdateCustomerPayload): Promise<Customer> =>
    apiClient.patch(`/sales/customers/${id}`, dto).then((r) => r.data),

  deleteCustomer: (id: string): Promise<void> =>
    apiClient.delete(`/sales/customers/${id}`).then((r) => r.data),

  // Performance & targets
  getPerformance: (period: string): Promise<SalesPerformance> =>
    apiClient.get('/sales/performance', { params: { period } }).then((r) => r.data),

  setCompanyTarget: (dto: UpsertTargetPayload): Promise<void> =>
    apiClient.put('/sales/targets/company', dto).then(() => undefined),

  removeCompanyTarget: (period: string): Promise<void> =>
    apiClient.delete('/sales/targets/company', { params: { period } }).then(() => undefined),

  setSellerTarget: (userId: string, dto: UpsertTargetPayload): Promise<void> =>
    apiClient.put(`/sales/targets/sellers/${userId}`, dto).then(() => undefined),

  removeSellerTarget: (userId: string, period: string): Promise<void> =>
    apiClient.delete(`/sales/targets/sellers/${userId}`, { params: { period } }).then(() => undefined),
};

export const combosApi = {
  list: (onlyActive = false): Promise<SaleCombo[]> =>
    apiClient.get('/sales/combos', { params: onlyActive ? { onlyActive: 'true' } : undefined }).then((r) => r.data),

  get: (id: string): Promise<SaleCombo> =>
    apiClient.get(`/sales/combos/${id}`).then((r) => r.data),

  create: (dto: CreateComboPayload): Promise<SaleCombo> =>
    apiClient.post('/sales/combos', dto).then((r) => r.data),

  update: (id: string, dto: UpdateComboPayload): Promise<SaleCombo> =>
    apiClient.patch(`/sales/combos/${id}`, dto).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    apiClient.delete(`/sales/combos/${id}`).then(() => undefined),
};
