import { apiClient } from './client';
import type { APStatus } from './payables';
import type { SupplierInvoiceStatus } from '../supplier-invoice';

type Person = { id: string; firstName: string; lastName: string } | null;

/** Una recepción del proveedor que todavía no tiene factura. */
export interface InvoiceablePayable {
  id: string;
  amount: number;
  paidAmount: number;
  status: APStatus;
  purchaseReceipt: {
    id: string;
    receiptNumber: number;
    receivedAt: string;
    purchaseOrder: { id: string; orderNumber: string | null };
    items: {
      id: string;
      quantity: number;
      unitCost: number;
      product: { id: string; name: string; unit: string };
    }[];
  };
}

export interface SupplierInvoiceItem {
  id: string;
  purchaseReceiptItemId: string;
  accountsPayableId: string;
  quantity: number;
  unitCost: number;
  receivedQuantity: number;
  receivedUnitCost: number;
  purchaseReceiptItem: {
    product: { id: string; name: string; unit: string };
    purchaseReceipt: { id: string; receiptNumber: number };
  };
}

export interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  timbrado: string | null;
  invoiceDate: string;
  subtotal: number;
  shippingAmount: number;
  discountAmount: number;
  total: number;
  estimatedTotal: number;
  status: SupplierInvoiceStatus;
  notes: string | null;
  /** PDF o imagen de la factura, si se adjuntó. */
  fileId: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  supplier: { id: string; name: string; paymentTermDays: number | null };
  createdBy: Person;
  reviewedBy: Person;
  items: SupplierInvoiceItem[];
  /** Vacío si la factura fue rechazada: las recepciones quedaron libres. */
  payables: {
    id: string;
    amount: number;
    estimatedAmount: number | null;
    paidAmount: number;
    status: APStatus;
  }[];
}

export interface CreateSupplierInvoicePayload {
  supplierId: string;
  payableIds: string[];
  invoiceNumber: string;
  timbrado?: string;
  invoiceDate: string;
  /** El total que figura al pie de la factura. */
  total: number;
  fileId?: string;
  shippingAmount?: number;
  discountAmount?: number;
  notes?: string;
  lines: { purchaseReceiptItemId: string; quantity: number; unitCost: number }[];
}

// La API manda los decimales como texto: se pasan a número una sola vez.
function normalizeInvoice(raw: SupplierInvoice): SupplierInvoice {
  return {
    ...raw,
    subtotal: Number(raw.subtotal),
    shippingAmount: Number(raw.shippingAmount),
    discountAmount: Number(raw.discountAmount),
    total: Number(raw.total),
    estimatedTotal: Number(raw.estimatedTotal),
    items: raw.items.map((item) => ({
      ...item,
      unitCost: Number(item.unitCost),
      receivedUnitCost: Number(item.receivedUnitCost),
    })),
    payables: raw.payables.map((payable) => ({
      ...payable,
      amount: Number(payable.amount),
      estimatedAmount:
        payable.estimatedAmount === null ? null : Number(payable.estimatedAmount),
      paidAmount: Number(payable.paidAmount),
    })),
  };
}

export const supplierInvoicesApi = {
  invoiceable: (supplierId: string): Promise<InvoiceablePayable[]> =>
    apiClient
      .get('/procurement/supplier-invoices/invoiceable', { params: { supplierId } })
      .then((r) =>
        (r.data as InvoiceablePayable[]).map((payable) => ({
          ...payable,
          amount: Number(payable.amount),
          paidAmount: Number(payable.paidAmount),
          purchaseReceipt: {
            ...payable.purchaseReceipt,
            items: payable.purchaseReceipt.items.map((item) => ({
              ...item,
              unitCost: Number(item.unitCost),
            })),
          },
        })),
      ),

  get: (id: string): Promise<SupplierInvoice> =>
    apiClient
      .get(`/procurement/supplier-invoices/${id}`)
      .then((r) => normalizeInvoice(r.data)),

  create: (dto: CreateSupplierInvoicePayload): Promise<SupplierInvoice> =>
    apiClient
      .post('/procurement/supplier-invoices', dto)
      .then((r) => normalizeInvoice(r.data)),

  attachFile: (id: string, fileId: string): Promise<SupplierInvoice> =>
    apiClient
      .post(`/procurement/supplier-invoices/${id}/file`, { fileId })
      .then((r) => normalizeInvoice(r.data)),

  approve: (id: string, note?: string): Promise<SupplierInvoice> =>
    apiClient
      .post(`/procurement/supplier-invoices/${id}/approve`, note ? { note } : {})
      .then((r) => normalizeInvoice(r.data)),

  reject: (id: string, reason: string): Promise<SupplierInvoice> =>
    apiClient
      .post(`/procurement/supplier-invoices/${id}/reject`, { reason })
      .then((r) => normalizeInvoice(r.data)),
};
