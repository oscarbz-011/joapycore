import { apiClient } from './client';
import type { PaymentMethod } from '../payment-methods';

export type InvoiceStatus = 'PENDING' | 'ISSUED' | 'PAID' | 'CANCELLED';
export type CreditNoteStatus = 'ISSUED' | 'APPLIED';
export type { PaymentMethod } from '../payment-methods';

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  ivaRate: number | null;
  ivaAmount: number | null;
  unitPriceWithoutIva: number | null;
}

export interface InvoiceTenant {
  razonSocial: string | null;
  nombreFantasia: string | null;
  ruc: string | null;
  address: string | null;
  numeroCasa: string | null;
  city: string | null;
  department: string | null;
  phone: string | null;
  logoFileId: string | null;
  timbradoNumero: string | null;
  timbradoFecha: string | null;
  timbradoFechaFin: string | null;
}

export interface InvoiceBranch {
  id: string;
  name: string;
  address: string | null;
  numeroCasa: string | null;
  city: string | null;
  phone: string | null;
  codigoEstablecimiento: string | null;
  puntoExpedicion: string | null;
}

export interface Invoice {
  id: string;
  status: InvoiceStatus;
  issuedAt: string | null;
  dueDate: string | null;
  total: number;
  notes: string | null;
  paymentMethod: PaymentMethod | null;
  createdAt: string;
  // Numbering
  invoiceNumber: string | null;
  invoicePrefix: string | null;
  // PDF
  pdfUrl: string | null;
  pdfFileId: string | null;
  // SIFEN
  cdc: string | null;
  qrUrl: string | null;
  electronicAt: string | null;
  tenant: InvoiceTenant;
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
    branch: InvoiceBranch | null;
    downPayment: { amount: number } | null;
    loan: {
      totalAmount: number;
      interestRate: number;
      totalInstallments: number;
      installments: { dueDate: string }[];
    } | null;
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
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export function canRetryInvoicePdf(invoice: Pick<Invoice, 'status' | 'pdfFileId'>): boolean {
  return (
    (invoice.status === 'ISSUED' || invoice.status === 'PAID') &&
    !invoice.pdfFileId
  );
}

export function canPrintInvoicePdf(invoice: Pick<Invoice, 'status' | 'pdfFileId'>): boolean {
  return (
    (invoice.status === 'ISSUED' || invoice.status === 'PAID') &&
    Boolean(invoice.pdfFileId)
  );
}

export const billingApi = {
  listInvoices: (): Promise<Invoice[]> =>
    apiClient.get('/billing/invoices').then((r) => r.data),

  getInvoice: (id: string): Promise<Invoice> =>
    apiClient.get(`/billing/invoices/${id}`).then((r) => r.data),

  issueInvoice: (id: string, dto: IssueInvoicePayload): Promise<Invoice> =>
    apiClient.post(`/billing/invoices/${id}/issue`, dto).then((r) => r.data),

  retryInvoicePdf: (id: string): Promise<Invoice> =>
    apiClient.post(`/billing/invoices/${id}/pdf/retry`).then((r) => r.data),

  cancelInvoice: (id: string, reason: string): Promise<Invoice> =>
    apiClient.post(`/billing/invoices/${id}/cancel`, { reason }).then((r) => r.data),

  listCreditNotes: (): Promise<CreditNote[]> =>
    apiClient.get('/billing/credit-notes').then((r) => r.data),
};
