import { apiClient } from './client';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  ivaRate: number | null;
  ivaAmount: number | null;
}

export interface Invoice {
  id: string;
  status: InvoiceStatus;
  issuedAt: string | null;
  dueDate: string | null;
  total: number;
  notes: string | null;
  createdAt: string;
  saleOrder: {
    id: string;
    customer: { id: string; firstName: string; lastName: string; email: string | null };
  };
  items: InvoiceItem[];
}

export const billingApi = {
  listInvoices: (): Promise<Invoice[]> =>
    apiClient.get('/billing/invoices').then((r) => r.data),

  getInvoice: (id: string): Promise<Invoice> =>
    apiClient.get(`/billing/invoices/${id}`).then((r) => r.data),

  cancelInvoice: (id: string): Promise<Invoice> =>
    apiClient.post(`/billing/invoices/${id}/cancel`).then((r) => r.data),
};
