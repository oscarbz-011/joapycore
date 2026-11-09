import { apiClient } from "./client";
import type { PaymentMethod } from "../payment-methods";

export type InvoiceStatus = "PENDING" | "ISSUED" | "PAID" | "CANCELLED";
export type CreditNoteStatus = "ISSUED" | "APPLIED";
export type BillingModality = "PREPRINTED" | "SELF_PRINTED" | "ELECTRONIC";
export type BillingDocumentType = "INVOICE" | "CREDIT_NOTE";
/** TOTAL anula la operación; ITEMS acepta una devolución; AMOUNT concede un descuento. */
export type CreditNoteKind = "TOTAL" | "ITEMS" | "AMOUNT";
/** Qué pasa con la plata que el cliente ya pagó y deja de deber. */
export type SettlementMode = "CUSTOMER_CREDIT" | "REFUND";
export type BillingEventType =
  | "ISSUED"
  | "NUMBERED"
  | "FORM_PRINTED"
  | "SHEET_VOIDED"
  | "SCAN_ATTACHED"
  | "SCAN_REMOVED"
  | "VOIDED"
  | "CREDIT_NOTE_ISSUED"
  | "REFUNDED"
  | "CUSTOMER_CREDITED";
export type { PaymentMethod } from "../payment-methods";

/** Posición sobre la hoja del talonario, en mm desde arriba a la izquierda. */
export interface FormPoint {
  x: number;
  y: number;
}

/** Dónde va cada dato sobre la hoja preimpresa. En los importes, `x` es el borde derecho. */
export interface PreprintedLayout {
  pageWidth: number;
  pageHeight: number;
  offsetX: number;
  offsetY: number;
  fontSize: number;
  date: FormPoint;
  cashMark: FormPoint;
  creditMark: FormPoint;
  buyerName: FormPoint;
  buyerDocument: FormPoint;
  buyerAddress: FormPoint;
  /** Nota de crédito: la factura que modifica. */
  relatedDocument: FormPoint;
  items: {
    top: number;
    lineHeight: number;
    maxLines: number;
    quantityX: number;
    descriptionX: number;
    descriptionWidth: number;
    unitPriceX: number;
    exemptX: number;
    taxed5X: number;
    taxed10X: number;
  };
  subtotalsY: number;
  total: FormPoint;
  totalInWords: FormPoint;
  iva5: FormPoint;
  iva10: FormPoint;
  ivaTotal: FormPoint;
}

/** Lo que se imprime de una factura: en papel térmico, en A4 o sobre la hoja del talonario. */
export interface FiscalReceipt {
  invoiceId: string;
  modality: BillingModality | null;
  number: string;
  timbrado: string | null;
  timbradoValidFrom: string | null;
  timbradoValidUntil: string | null;
  issuedAt: string | null;
  condition: "CONTADO" | "CRÉDITO";
  issuer: {
    name: string;
    fantasyName: string | null;
    ruc: string | null;
    address: string | null;
    city: string | null;
    phone: string | null;
    activity: string | null;
    branchName: string | null;
    branchAddress: string | null;
  };
  buyer: { name: string; document: string; address: string | null };
  /** Nota de crédito: la factura que modifica ("Factura 001-001-0000009 del 28/10/26"). */
  relatedDocument: string | null;
  lines: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    ivaRate: number;
  }[];
  totals: {
    exempt: number;
    taxed5: number;
    taxed10: number;
    iva5: number;
    iva10: number;
    ivaTotal: number;
    total: number;
  };
  formLayout: PreprintedLayout | null;
}

export interface FormPrintResult {
  receipt: FiscalReceipt;
  printCount: number;
  printedAt: string;
}

export interface AttachedFile {
  id: string;
  originalName: string;
  mimeType: string;
}

export interface VoidedSheet {
  id: string;
  sequential: number;
  reason: string;
  createdAt: string;
  voidedById: string | null;
  invoice: { id: string; invoicePrefix: string | null; invoiceNumber: string | null } | null;
  scanFile: AttachedFile | null;
}

export interface VoidInvoiceSheetPayload {
  reason: string;
  documentNumber?: number;
  scanFileId?: string;
}

export interface VoidLooseSheetPayload {
  documentNumber: number;
  reason: string;
  scanFileId?: string;
}

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
  modality: BillingModality | null;
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
  // Talonario de imprenta: impresiones sobre la hoja y escaneo de la factura física
  formPrintCount: number;
  formPrintedAt: string | null;
  physicalScanFileId: string | null;
  physicalScan: AttachedFile | null;
  // Consumidor final sin identificar: "Sin Nombre" y X
  anonymousBuyer: boolean;
  // Suma de las notas de crédito emitidas; anulada conservando el original y las copias
  creditedTotal: number | string;
  voidReason: string | null;
  voidedAt: string | null;
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

interface CreditNoteCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

export interface CreditNote {
  id: string;
  number: string | null;
  numberPrefix: string | null;
  kind: CreditNoteKind;
  reason: string;
  total: number | string;
  status: CreditNoteStatus;
  modality: BillingModality | null;
  issuedAt: string;
  appliedToBalance: number | string;
  createdAt: string;
  customer: CreditNoteCustomer | null;
  invoice: {
    id: string;
    invoicePrefix: string | null;
    invoiceNumber: string | null;
    total: number | string;
    issuedAt: string | null;
    status: InvoiceStatus;
    saleOrder: { customer: CreditNoteCustomer } | null;
  };
}

export interface CreditNoteItemRow {
  id: string;
  invoiceItemId: string | null;
  description: string;
  quantity: number;
  unitPrice: number | string;
  total: number | string;
  ivaRate: number | string | null;
  ivaAmount: number | string | null;
  restockQuantity: number;
  serialNumbers: string[];
}

export interface BillingEvent {
  id: string;
  type: BillingEventType;
  detail: Record<string, unknown> | null;
  userId: string | null;
  createdAt: string;
  creditNoteId: string | null;
}

export interface CreditNoteDetail extends CreditNote {
  timbrado: string | null;
  timbradoValidFrom: string | null;
  timbradoValidUntil: string | null;
  sequential: number | null;
  seriesId: string | null;
  pdfFileId: string | null;
  formPrintCount: number;
  formPrintedAt: string | null;
  physicalScan: AttachedFile | null;
  items: CreditNoteItemRow[];
  refunds: {
    id: string;
    amount: number | string;
    method: PaymentMethod;
    reference: string | null;
    createdAt: string;
  }[];
  customerCredits: { id: string; amount: number | string; createdAt: string }[];
  events: BillingEvent[];
}

/** Lo que queda por acreditar de un ítem de la factura. */
export interface CreditableInvoiceItem {
  invoiceItemId: string;
  description: string;
  quantity: number;
  creditableQuantity: number;
  /** Precio por unidad que se acredita (en crédito, sobre el total financiado). */
  unitPrice: number;
  ivaRate: number;
  saleOrderItemId: string | null;
  restockable: boolean;
  isSerialized: boolean;
  soldSerials: string[];
}

export interface CreditNoteOptions {
  invoice: {
    id: string;
    number: string;
    status: InvoiceStatus;
    total: number;
    creditedTotal: number;
    remaining: number;
    isCreditSale: boolean;
  };
  customer: { id: string; name: string; creditBalance: number } | null;
  /** Lo que el cliente todavía debe de la factura y lo que ya pagó. */
  balance: { outstanding: number; paid: number };
  items: CreditableInvoiceItem[];
  series: BillingSeriesOption[];
}

export interface SettlementPayload {
  mode: SettlementMode;
  method?: PaymentMethod;
  reference?: string;
}

export interface IssueCreditNotePayload {
  kind: CreditNoteKind;
  reason: string;
  items?: { invoiceItemId: string; quantity: number }[];
  amount?: number;
  ivaRate?: number;
  restock?: { invoiceItemId: string; quantity: number; serialNumbers?: string[] }[];
  seriesId?: string;
  documentNumber?: number;
  excess?: SettlementPayload;
}

export interface VoidInvoicePayload {
  reason: string;
  settlement?: SettlementPayload;
}

export interface CustomerCredit {
  balance: number;
  entries: {
    id: string;
    amount: number | string;
    source: "CREDIT_NOTE" | "INVOICE_VOID" | "APPLIED";
    note: string | null;
    createdAt: string;
    creditNote: { id: string; numberPrefix: string | null; number: string | null } | null;
    invoice: { id: string; invoicePrefix: string | null; invoiceNumber: string | null } | null;
  }[];
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
  printLayout: PreprintedLayout;
  createdAt: string;
  updatedAt: string;
  branch: { id: string; name: string };
  _count: { invoices: number; creditNotes?: number };
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
  /** null vuelve al diseño estándar. */
  printLayout?: PreprintedLayout | null;
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
  invoice: Pick<Invoice, "status" | "pdfFileId"> & { modality?: BillingModality | null },
): "print" | "retry" | null {
  // Con talonario la factura es la hoja impresa: no tiene PDF.
  if (invoice.modality === "PREPRINTED") return null;
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

  listInvoiceCreditNotes: (invoiceId: string): Promise<CreditNote[]> =>
    apiClient.get(`/billing/invoices/${invoiceId}/credit-notes`).then((r) => r.data),

  getCreditNoteOptions: (invoiceId: string): Promise<CreditNoteOptions> =>
    apiClient.get(`/billing/invoices/${invoiceId}/credit-note-options`).then((r) => r.data),

  issueCreditNote: (invoiceId: string, dto: IssueCreditNotePayload): Promise<CreditNoteDetail> =>
    apiClient.post(`/billing/invoices/${invoiceId}/credit-notes`, dto).then((r) => r.data),

  voidInvoice: (invoiceId: string, dto: VoidInvoicePayload): Promise<{ id: string }> =>
    apiClient.post(`/billing/invoices/${invoiceId}/void`, dto).then((r) => r.data),

  listInvoiceEvents: (invoiceId: string): Promise<BillingEvent[]> =>
    apiClient.get(`/billing/invoices/${invoiceId}/events`).then((r) => r.data),

  getCreditNote: (id: string): Promise<CreditNoteDetail> =>
    apiClient.get(`/billing/credit-notes/${id}`).then((r) => r.data),

  /** Datos para imprimir la nota sobre la hoja del talonario; registra la impresión. */
  printCreditNoteForm: (id: string): Promise<FormPrintResult> =>
    apiClient.post(`/billing/credit-notes/${id}/form/print`).then((r) => r.data),

  retryCreditNotePdf: (id: string): Promise<CreditNoteDetail> =>
    apiClient.post(`/billing/credit-notes/${id}/pdf/retry`).then((r) => r.data),

  setCreditNotePhysicalScan: (id: string, fileId: string | null): Promise<CreditNoteDetail> =>
    apiClient.post(`/billing/credit-notes/${id}/physical-scan`, { fileId }).then((r) => r.data),

  getCustomerCredit: (customerId: string): Promise<CustomerCredit> =>
    apiClient.get(`/billing/customers/${customerId}/credit`).then((r) => r.data),

  /** Datos para imprimir sobre la hoja del talonario; registra la impresión. */
  printInvoiceForm: (invoiceId: string): Promise<FormPrintResult> =>
    apiClient.post(`/billing/invoices/${invoiceId}/form/print`).then((r) => r.data),

  voidInvoiceSheet: (invoiceId: string, dto: VoidInvoiceSheetPayload): Promise<Invoice> =>
    apiClient.post(`/billing/invoices/${invoiceId}/sheet/void`, dto).then((r) => r.data),

  setInvoicePhysicalScan: (invoiceId: string, fileId: string | null): Promise<Invoice> =>
    apiClient.post(`/billing/invoices/${invoiceId}/physical-scan`, { fileId }).then((r) => r.data),

  listVoidedSheets: (seriesId: string): Promise<VoidedSheet[]> =>
    apiClient.get(`/billing/series/${seriesId}/voided`).then((r) => r.data),

  voidLooseSheet: (seriesId: string, dto: VoidLooseSheetPayload): Promise<VoidedSheet[]> =>
    apiClient.post(`/billing/series/${seriesId}/voided`, dto).then((r) => r.data),

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
