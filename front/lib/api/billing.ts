import { apiClient } from './client';

export type InvoiceStatus = 'PENDING' | 'ISSUED' | 'PAID' | 'CANCELLED';
export type CreditNoteStatus = 'ISSUED' | 'APPLIED';

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
  // Numbering
  invoiceNumber: string | null;
  invoicePrefix: string | null;
  // PDF
  pdfUrl: string | null;
  // SIFEN
  cdc: string | null;
  qrUrl: string | null;
  electronicAt: string | null;
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
  };
  items: InvoiceItem[];
}

export interface CreditNote {
  id: string;
  invoiceId: string;
  number: string | null;
  reason: string;
  total: number;
  status: CreditNoteStatus;
  issuedAt: string;
  createdAt: string;
  invoice: {
    id: string;
    total: number;
    saleOrder: {
      customer: { id: string; firstName: string; lastName: string; email: string | null };
    };
  };
}

export interface IssueInvoicePayload {
  paymentCondition: 'CASH' | 'CREDIT';
  dueDate?: string;
  invoiceNumber?: string;
  invoicePrefix?: string;
  notes?: string;
}

export const billingApi = {
  listInvoices: (): Promise<Invoice[]> =>
    apiClient.get('/billing/invoices').then((r) => r.data),

  getInvoice: (id: string): Promise<Invoice> =>
    apiClient.get(`/billing/invoices/${id}`).then((r) => r.data),

  issueInvoice: (id: string, dto: IssueInvoicePayload): Promise<Invoice> =>
    apiClient.post(`/billing/invoices/${id}/issue`, dto).then((r) => r.data),

  cancelInvoice: (id: string, reason: string): Promise<Invoice> =>
    apiClient.post(`/billing/invoices/${id}/cancel`, { reason }).then((r) => r.data),

  listCreditNotes: (): Promise<CreditNote[]> =>
    apiClient.get('/billing/credit-notes').then((r) => r.data),
};
