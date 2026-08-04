import { apiClient } from './client';

export type ARStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type PaymentMethod =
  | 'BANK_TRANSFER'
  | 'CASH'
  | 'PAGO_EXPRESS'
  | 'AQUI_PAGO'
  | 'DEPOSITO'
  | 'CHEQUE';

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
    status: 'PENDING' | 'ISSUED' | 'PAID' | 'CANCELLED';
    total: number;
    issuedAt: string | null;
    invoiceNumber: string | null;
    invoicePrefix: string | null;
    saleOrder: {
      id: string;
      saleType: 'CASH' | 'CREDIT';
      installments: number | null;
      customer: {
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        documentType: string | null;
        documentNumber: string | null;
      };
      loan: {
        totalAmount: number;
        installments: { paidAmount: number }[];
      } | null;
    };
  };
  paymentRecords: PaymentRecord[];
}

export interface CollectionsSummary {
  month: string;
  total: number;
  cash:   { total: number; byMethod: Record<string, number> };
  credit: { total: number; byMethod: Record<string, number> };
  byMethod: Record<string, number>;
}

export interface RegisterPaymentPayload {
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  reference?: string;
  notes?: string;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia bancaria',
  PAGO_EXPRESS: 'Pago Express',
  AQUI_PAGO: 'AquíPago',
  DEPOSITO: 'Depósito bancario',
  CHEQUE: 'Cheque',
};

export const paymentsApi = {
  listAR: (): Promise<AccountsReceivable[]> =>
    apiClient.get('/payments/accounts-receivable').then((r) => r.data),

  getAR: (id: string): Promise<AccountsReceivable> =>
    apiClient.get(`/payments/accounts-receivable/${id}`).then((r) => r.data),

  registerPayment: (id: string, dto: RegisterPaymentPayload): Promise<AccountsReceivable> =>
    apiClient.post(`/payments/accounts-receivable/${id}/payments`, dto).then((r) => r.data),

  getCollections: (month?: string): Promise<CollectionsSummary> =>
    apiClient.get('/payments/collections', { params: month ? { month } : undefined }).then((r) => r.data),
};
