import { apiClient } from './client';

export type ARStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'BANK_TRANSFER' | 'CASH';

export interface PaymentRecord {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AccountsReceivable {
  id: string;
  amount: number;
  paidAmount: number;
  status: ARStatus;
  dueDate: string | null;
  createdAt: string;
  invoice: {
    id: string;
    total: number;
    issuedAt: string | null;
    saleOrder: {
      id: string;
      customer: { id: string; firstName: string; lastName: string; email: string | null };
    };
  };
  paymentRecords: PaymentRecord[];
}

export interface RegisterPaymentPayload {
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  reference?: string;
  notes?: string;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  BANK_TRANSFER: 'Transferencia bancaria',
  CASH: 'Efectivo',
};

export const paymentsApi = {
  listAR: (): Promise<AccountsReceivable[]> =>
    apiClient.get('/payments/accounts-receivable').then((r) => r.data),

  getAR: (id: string): Promise<AccountsReceivable> =>
    apiClient.get(`/payments/accounts-receivable/${id}`).then((r) => r.data),

  registerPayment: (id: string, dto: RegisterPaymentPayload): Promise<AccountsReceivable> =>
    apiClient.post(`/payments/accounts-receivable/${id}/payments`, dto).then((r) => r.data),
};
