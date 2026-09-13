import { apiClient } from './client';

export type ARStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
import type { PaymentMethod } from '../payment-methods';

export type { PaymentMethod } from '../payment-methods';
export { PAYMENT_METHOD_LABELS } from '../payment-methods';

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
    items: { description: string; quantity: number }[];
    saleOrder: {
      id: string;
      saleType: 'CASH' | 'CREDIT';
      installments: number | null;
      customer: {
        id: string;
        customerCode: string | null;
        firstName: string;
        secondFirstName: string | null;
        lastName: string;
        secondLastName: string | null;
        email: string | null;
        documentType: string | null;
        documentNumber: string | null;
      };
      loan: {
        totalAmount: number;
        // number/dueDate/status habilitan calcular la mora sobre la cuota
        // real más próxima sin pagar — nunca usar el `dueDate` de este AR
        // para crédito, queda fijo en la fecha de la primera cuota desde
        // que se crea el préstamo y no se actualiza (ver front/lib/ar-urgency.ts).
        installments: {
          number: number;
          dueDate: string;
          status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
          amount: number;
          paidAmount: number;
        }[];
      } | null;
    };
  };
  paymentRecords: PaymentRecord[];
}

export type CollectionsRange = 'day' | 'week' | 'month';

export interface CollectionsSummary {
  range: CollectionsRange;
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

export const paymentsApi = {
  listAR: (): Promise<AccountsReceivable[]> =>
    apiClient.get('/payments/accounts-receivable').then((r) => r.data),

  getAR: (id: string): Promise<AccountsReceivable> =>
    apiClient.get(`/payments/accounts-receivable/${id}`).then((r) => r.data),

  registerPayment: (id: string, dto: RegisterPaymentPayload): Promise<AccountsReceivable> =>
    apiClient.post(`/payments/accounts-receivable/${id}/payments`, dto).then((r) => r.data),

  getCollections: (range?: CollectionsRange): Promise<CollectionsSummary> =>
    apiClient.get('/payments/collections', { params: range ? { range } : undefined }).then((r) => r.data),
};
