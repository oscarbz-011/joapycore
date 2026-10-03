import type { InterestInvoice, Invoice, InvoiceStatus } from './api/billing';

export type InvoiceKind = 'SALE' | 'INTEREST';

export interface InvoiceRow {
  id: string;
  kind: InvoiceKind;
  number: string;
  customerName: string;
  customerEmail: string | null;
  typeLabel: string;
  date: string;
  status: InvoiceStatus;
  total: number;
  // Solo facturas de intereses: se abren por su PDF, no por el detalle.
  pdfFileId: string | null;
}

function invoiceNumber(invoice: {
  id: string;
  invoiceNumber: string | null;
  invoicePrefix: string | null;
}): string {
  return invoice.invoiceNumber
    ? `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber}`
    : `#${invoice.id.slice(0, 8).toUpperCase()}`;
}

/** Une facturas de venta y de intereses en una sola lista, más recientes primero. */
export function toInvoiceRows(
  sales: Invoice[],
  interests: InterestInvoice[],
): InvoiceRow[] {
  const saleRows = sales.map(
    (invoice): InvoiceRow => ({
      id: invoice.id,
      kind: 'SALE',
      number: invoiceNumber(invoice),
      customerName: `${invoice.saleOrder.customer.firstName} ${invoice.saleOrder.customer.lastName}`,
      customerEmail: invoice.saleOrder.customer.email,
      typeLabel:
        invoice.saleOrder.saleType === 'CREDIT'
          ? `Crédito${invoice.saleOrder.installments ? ` · ${invoice.saleOrder.installments}c` : ''}`
          : 'Contado',
      date: invoice.issuedAt ?? invoice.createdAt,
      status: invoice.status,
      total: Number(invoice.total),
      pdfFileId: null,
    }),
  );
  const interestRows = interests.map((invoice): InvoiceRow => {
    const customer = invoice.paymentReceipt?.customer;
    return {
      id: invoice.id,
      kind: 'INTEREST',
      number: invoiceNumber(invoice),
      customerName: customer
        ? `${customer.firstName} ${customer.lastName}`
        : '—',
      customerEmail: customer?.email ?? null,
      typeLabel: invoice.paymentReceipt
        ? `Intereses · Recibo ${invoice.paymentReceipt.receiptNumber}`
        : 'Intereses',
      date: invoice.issuedAt ?? invoice.createdAt,
      status: invoice.status,
      total: Number(invoice.total),
      pdfFileId: invoice.pdfFileId,
    };
  });
  return [...saleRows, ...interestRows].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
}

export function filterInvoiceRows(
  rows: InvoiceRow[],
  filters: { search: string; status: InvoiceStatus | ''; kind: InvoiceKind | '' },
): InvoiceRow[] {
  const search = filters.search.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (!search ||
        row.customerName.toLowerCase().includes(search) ||
        row.number.toLowerCase().includes(search)) &&
      (!filters.status || row.status === filters.status) &&
      (!filters.kind || row.kind === filters.kind),
  );
}
