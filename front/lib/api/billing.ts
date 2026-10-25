import { apiClient } from "./client";
import type { PaymentMethod } from "../payment-methods";

export type InvoiceStatus = "PENDING" | "ISSUED" | "PAID" | "CANCELLED";
export type CreditNoteStatus = "ISSUED" | "APPLIED";
export type BillingModality = "PREPRINTED" | "SELF_PRINTED" | "ELECTRONIC";
export type BillingDocumentType = "INVOICE" | "CREDIT_NOTE";
export type { PaymentMethod } from "../payment-methods";

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

// Factura de intereses moratorios: no tiene pedido de venta, el cliente sale
// del recibo de cobro que la originó. El total llega como texto (Decimal).
export interface InterestInvoice {
  id: string;
  status: InvoiceStatus;
  issuedAt: string | null;
  createdAt: string;
  total: number | string;
  invoiceNumber: string | null;
  invoicePrefix: string | null;
  sequential: number | null;
  pdfFileId: string | null;
  paymentReceipt: {
    id: string;
    receiptNumber: string;
    customer: {
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
    };
  } | null;
}

export interface Invoice {
  id: string;
  invoiceType: "SALE" | "INTEREST";
  status: InvoiceStatus;
  issuedAt: string | null;
  dueDate: string | null;
  total: number;
  notes: string | null;
  paymentMethod: PaymentMethod | null;
  createdAt: string;
  // Numeración: copia de la serie al emitir
  seriesId: string | null;
  modality: BillingModality | null;
  timbrado: string | null;
  timbradoValidFrom: string | null;
  timbradoValidUntil: string | null;
  sequential: number | null;
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
    branchId: string | null;
    saleType: "CASH" | "CREDIT";
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
      customer: {
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
      };
    };
  };
}

export interface AssignInvoiceNumberPayload {
  seriesId?: string;
  /** Número del talonario; solo en series de talonario. */
  documentNumber?: number;
}

export interface IssueInvoicePayload extends AssignInvoiceNumberPayload {
  paymentCondition: "CASH" | "CREDIT";
  dueDate?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export interface BillingSeries {
  id: string;
  branchId: string;
  documentType: BillingDocumentType;
  modality: BillingModality;
  timbrado: string | null;
  validFrom: string | null;
  validUntil: string | null;
  establecimiento: string;
  puntoExpedicion: string;
  serieCode: string;
  rangeFrom: number;
  rangeTo: number;
  nextNumber: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  branch: { id: string; name: string };
  _count: { invoices: number };
}

/** Serie entre las que se puede elegir al numerar; `problem` dice por qué no sirve hoy. */
export interface BillingSeriesOption extends BillingSeries {
  problem: string | null;
}

export interface CreateBillingSeriesPayload {
  branchId: string;
  documentType?: BillingDocumentType;
  modality: BillingModality;
  timbrado: string;
  validFrom: string;
  validUntil?: string;
  establecimiento: string;
  puntoExpedicion: string;
  rangeFrom: number;
  rangeTo: number;
  nextNumber?: number;
}

export type UpdateBillingSeriesPayload = Partial<CreateBillingSeriesPayload> & {
  isActive?: boolean;
};

export function canRetryInvoicePdf(
  invoice: Pick<Invoice, "status" | "pdfFileId">,
): boolean {
  return (
    (invoice.status === "ISSUED" || invoice.status === "PAID") &&
    !invoice.pdfFileId
  );
}

export function canPrintInvoicePdf(
  invoice: Pick<Invoice, "status" | "pdfFileId">,
): boolean {
  return (
    (invoice.status === "ISSUED" || invoice.status === "PAID") &&
    Boolean(invoice.pdfFileId)
  );
}

export function invoicePdfAction(
  invoice: Pick<Invoice, "status" | "pdfFileId">,
): "print" | "retry" | null {
  if (canPrintInvoicePdf(invoice)) return "print";
  if (canRetryInvoicePdf(invoice)) return "retry";
  return null;
}

export const billingApi = {
  listInterestInvoices: (): Promise<InterestInvoice[]> =>
    apiClient.get('/billing/invoices/interest').then((r) => r.data),

  listInvoices: (): Promise<Invoice[]> =>
    apiClient.get("/billing/invoices").then((r) => r.data),

  getInvoice: (id: string): Promise<Invoice> =>
    apiClient.get(`/billing/invoices/${id}`).then((r) => r.data),

  issueInvoice: (id: string, dto: IssueInvoicePayload): Promise<Invoice> =>
    apiClient.post(`/billing/invoices/${id}/issue`, dto).then((r) => r.data),

  retryInvoicePdf: (id: string): Promise<Invoice> =>
    apiClient.post(`/billing/invoices/${id}/pdf/retry`).then((r) => r.data),

  cancelInvoice: (id: string, reason: string): Promise<Invoice> =>
    apiClient
      .post(`/billing/invoices/${id}/cancel`, { reason })
      .then((r) => r.data),

  listCreditNotes: (): Promise<CreditNote[]> =>
    apiClient.get("/billing/credit-notes").then((r) => r.data),

  getSeriesOptions: (invoiceId: string): Promise<BillingSeriesOption[]> =>
    apiClient.get(`/billing/invoices/${invoiceId}/series`).then((r) => r.data),

  assignInvoiceNumber: (
    invoiceId: string,
    dto: AssignInvoiceNumberPayload,
  ): Promise<Invoice> =>
    apiClient
      .post(`/billing/invoices/${invoiceId}/number`, dto)
      .then((r) => r.data),

  listSeries: (): Promise<BillingSeries[]> =>
    apiClient.get("/billing/series").then((r) => r.data),

  getSeries: (id: string): Promise<BillingSeries> =>
    apiClient.get(`/billing/series/${id}`).then((r) => r.data),

  createSeries: (dto: CreateBillingSeriesPayload): Promise<BillingSeries> =>
    apiClient.post("/billing/series", dto).then((r) => r.data),

  updateSeries: (
    id: string,
    dto: UpdateBillingSeriesPayload,
  ): Promise<BillingSeries> =>
    apiClient.patch(`/billing/series/${id}`, dto).then((r) => r.data),
};
