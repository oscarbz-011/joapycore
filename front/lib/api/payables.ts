import { apiClient } from './client';
import type { PaymentMethod } from './payments';

export type APStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';

export interface SupplierPayment {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AccountsPayable {
  id: string;
  amount: number;
  paidAmount: number;
  status: APStatus;
  dueDate: string | null;
  createdAt: string;
  supplier: {
    id: string;
    name: string;
    contactName: string | null;
    email: string | null;
  };
  purchaseReceipt: {
    id: string;
    receiptNumber: number;
    receivedAt: string;
    purchaseOrder: { id: string };
  };
  supplierPayments: SupplierPayment[];
}

export interface RegisterSupplierPaymentPayload {
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  reference?: string;
  notes?: string;
}

export const payablesApi = {
  listAP: (): Promise<AccountsPayable[]> =>
    apiClient.get('/procurement/payables').then((r) => r.data),

  getAP: (id: string): Promise<AccountsPayable> =>
    apiClient.get(`/procurement/payables/${id}`).then((r) => r.data),

  registerPayment: (id: string, dto: RegisterSupplierPaymentPayload): Promise<AccountsPayable> =>
    apiClient.post(`/procurement/payables/${id}/payments`, dto).then((r) => r.data),
};
