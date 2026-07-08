import { apiClient } from './client';

export type DocumentType = 'CI' | 'RUC' | 'PASSPORT';
export type SaleType = 'CASH' | 'CREDIT';
export type SaleOrderStatus =
  | 'PENDING'
  | 'PENDING_CREDIT_APPROVAL'
  | 'CREDIT_APPROVED'
  | 'CREDIT_REJECTED'
  | 'CONFIRMED'
  | 'INVOICED'
  | 'CANCELLED';

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
  // Structured delivery address
  homeStreet: string | null;
  homeNeighborhood: string | null;
  homeReference: string | null;
  aptBuilding: string | null;
  aptFloor: string | null;
  aptNumber: string | null;
}

export interface SaleOrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  ivaRate: number | null;
  ivaAmount: number | null;
  product: {
    id: string;
    name: string;
    model: string | null;
    isSerialized: boolean;
    usesLots: boolean;
    unit: string;
  };
  productUnits: { id: string; serialNumber: string }[];
  batch: { id: string; batchNumber: string } | null;
}

export interface SaleOrder {
  id: string;
  status: SaleOrderStatus;
  saleType: SaleType;
  installments: number | null;
  interestRate: number | null;
  orderDate: string;
  notes: string | null;
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
  items: SaleOrderItem[];
  invoice: { id: string; status: string } | null;
}

export interface CreateSaleOrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  serialNumbers?: string[];
  batchId?: string;
}

export interface CreateSaleOrderPayload {
  customerId: string;
  sellerId?: string;
  saleType?: SaleType;
  installments?: number;
  notes?: string;
  items: CreateSaleOrderItem[];
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
  // Structured delivery address
  homeStreet?: string;
  homeNeighborhood?: string;
  homeReference?: string;
  aptBuilding?: string;
  aptFloor?: string;
  aptNumber?: string;
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
