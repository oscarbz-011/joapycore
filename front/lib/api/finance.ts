import { apiClient } from './client';

export type LoanStatus = 'ACTIVE' | 'PAID' | 'CANCELLED';
export type InstallmentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface Installment {
  id: string;
  loanId: string;
  number: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  paidAt: string | null;
  // Fecha efectiva de pago (puede diferir de paidAt si se cargó con fecha
  // pasada) — la relevante para calcular puntualidad en el historial crediticio.
  paymentDate: string | null;
  status: InstallmentStatus;
  notes: string | null;
}

export interface LoanOrderItem {
  id: string;
  quantity: number;
  description: string | null;
  product: { id: string; name: string; model: string | null } | null;
}

export interface Loan {
  id: string;
  tenantId: string;
  saleOrderId: string;
  customerId: string;
  principal: number;
  interestRate: number;
  totalAmount: number;
  totalInstallments: number;
  status: LoanStatus;
  createdAt: string;
  customer: { id: string; firstName: string; lastName: string };
  saleOrder: { id: string; orderDate: string; items: LoanOrderItem[] };
  installments: Installment[];
}

export interface PayInstallmentPayload {
  amount: number;
  paymentMethod: string;
  paymentDate?: string;
  paymentReference?: string;
  notes?: string;
}

export interface PayInstallmentsPayload {
  items: { installmentId: string; amount: number }[];
  paymentMethod: string;
  paymentDate?: string;
  paymentReference?: string;
  notes?: string;
}

export interface PaymentReceiptItem {
  id: string;
  installmentId: string;
  installmentNumber: number;
  amountApplied: number;
}

export interface PaymentReceiptTenant {
  razonSocial: string | null;
  nombreFantasia: string | null;
  ruc: string | null;
  address: string | null;
  numeroCasa: string | null;
  city: string | null;
  phone: string | null;
  logoFileId: string | null;
}

export interface PaymentReceipt {
  id: string;
  receiptNumber: string;
  establecimiento: string;
  puntoExpedicion: string;
  sequential: number;
  totalAmount: number;
  paymentMethod: string;
  paymentReference: string | null;
  issuedAt: string;
  pdfFileId: string | null;
  items: PaymentReceiptItem[];
  loan: { id: string; saleOrderId: string };
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    customerCode: string | null;
    documentType: string | null;
    documentNumber: string | null;
  };
  branch: { id: string; name: string; city: string | null } | null;
  collectedBy: { id: string; firstName: string; lastName: string } | null;
  tenant: PaymentReceiptTenant;
}

export const financeApi = {
  listLoans: (): Promise<Loan[]> =>
    apiClient.get('/finance/loans').then((r) => r.data),

  getLoan: (id: string): Promise<Loan> =>
    apiClient.get(`/finance/loans/${id}`).then((r) => r.data),

  getLoanByOrder: (saleOrderId: string): Promise<Loan> =>
    apiClient.get(`/finance/loans/by-order/${saleOrderId}`).then((r) => r.data),

  getOverdueInstallments: (): Promise<(Installment & { loan: Pick<Loan, 'id' | 'customer'> })[]> =>
    apiClient.get('/finance/loans/overdue-installments').then((r) => r.data),

  payInstallment: (installmentId: string, dto: PayInstallmentPayload): Promise<{ installment: Installment; receipt: PaymentReceipt }> =>
    apiClient
      .post(`/finance/loans/installments/${installmentId}/pay`, dto)
      .then((r) => r.data),

  payInstallments: (loanId: string, dto: PayInstallmentsPayload): Promise<{ loan: Loan; receipt: PaymentReceipt }> =>
    apiClient
      .post(`/finance/loans/${loanId}/pay-installments`, dto)
      .then((r) => r.data),

  getReceipt: (id: string): Promise<PaymentReceipt> =>
    apiClient.get(`/finance/loans/receipts/${id}`).then((r) => r.data),

  getReceiptForInstallment: (installmentId: string): Promise<PaymentReceipt> =>
    apiClient.get(`/finance/loans/installments/${installmentId}/receipt`).then((r) => r.data),
};
