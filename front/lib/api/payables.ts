import { apiClient } from './client';
import type { PaymentMethod } from './payments';
import type { SupplierInvoiceStatus } from '../supplier-invoice';

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
  /** Parte de lo pagado que vino del anticipo de la orden. */
  advanceApplied: number;
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
  /** Lo estimado al recibir, una vez que la factura fijó `amount`. */
  estimatedAmount: number | null;
  /** Factura del proveedor; sin ella `amount` es una estimación. */
  supplierInvoice: {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    status: SupplierInvoiceStatus;
    total: number;
    estimatedTotal: number;
  } | null;
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
