import type {
  BillingEvent,
  BillingEventType,
  CreditableInvoiceItem,
  CreditNote,
  CreditNoteKind,
  Invoice,
} from './api/billing';

export const CREDIT_NOTE_KIND_LABELS: Record<CreditNoteKind, string> = {
  TOTAL: 'Total',
  ITEMS: 'Devolución de ítems',
  AMOUNT: 'Descuento o bonificación',
};

export const BILLING_EVENT_LABELS: Record<BillingEventType, string> = {
  ISSUED: 'Emitida',
  NUMBERED: 'Numerada',
  FORM_PRINTED: 'Impresa sobre la hoja',
  SHEET_VOIDED: 'Hoja inutilizada',
  SCAN_ATTACHED: 'Escaneo adjuntado',
  SCAN_REMOVED: 'Escaneo quitado',
  VOIDED: 'Anulada',
  CREDIT_NOTE_ISSUED: 'Nota de crédito emitida',
  REMISSION_NOTE_ISSUED: 'Nota de remisión emitida',
  REMISSION_RECEIVED: 'Mercadería recibida en el destino',
  REFUNDED: 'Dinero devuelto',
  CUSTOMER_CREDITED: 'Saldo a favor del cliente',
};

const money = (n: number) =>
  `Gs. ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n)}`;

export function creditNoteNumber(note: Pick<CreditNote, 'number' | 'numberPrefix' | 'id'>): string {
  if (!note.number) return `NC-${note.id.slice(0, 6).toUpperCase()}`;
  return `${note.numberPrefix ?? ''}${note.number}`;
}

export function creditNoteInvoiceNumber(note: Pick<CreditNote, 'invoice'>): string {
  return `${note.invoice.invoicePrefix ?? ''}${note.invoice.invoiceNumber ?? ''}` || '—';
}

export function creditNoteCustomerName(note: Pick<CreditNote, 'customer' | 'invoice'>): string {
  const customer = note.customer ?? note.invoice.saleOrder?.customer;
  return customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'Sin Nombre';
}

/** Detalle de un evento del historial, en una línea. */
export function billingEventDetail(event: Pick<BillingEvent, 'type' | 'detail'>): string {
  const detail = event.detail ?? {};
  const amount = typeof detail.amount === 'number' ? money(detail.amount) : '';
  switch (event.type) {
    case 'CREDIT_NOTE_ISSUED':
      return [detail.number, typeof detail.total === 'number' ? money(detail.total) : '']
        .filter(Boolean)
        .join(' · ');
    case 'SHEET_VOIDED':
      return [
        detail.voidedSheet != null ? `Hoja ${String(detail.voidedSheet)}` : '',
        detail.movedTo != null ? `pasó a la ${String(detail.movedTo)}` : '',
        typeof detail.reason === 'string' ? detail.reason : '',
      ]
        .filter(Boolean)
        .join(' · ');
    case 'VOIDED':
      return typeof detail.reason === 'string' ? detail.reason : '';
    case 'REMISSION_RECEIVED':
      return detail.differences === true
        ? ['Con faltantes', typeof detail.notes === 'string' ? detail.notes : ''].filter(Boolean).join(' · ')
        : 'Llegó completa';
    case 'REMISSION_NOTE_ISSUED':
    case 'NUMBERED':
      return typeof detail.number === 'string' ? detail.number : '';
    case 'FORM_PRINTED':
      return typeof detail.printNumber === 'number' ? `Impresión ${detail.printNumber}` : '';
    case 'REFUNDED':
    case 'CUSTOMER_CREDITED':
      return amount;
    default:
      return '';
  }
}

export type InvoiceCreditState = 'none' | 'partial' | 'full';

export function invoiceCreditState(invoice: Pick<Invoice, 'total' | 'creditedTotal'>): InvoiceCreditState {
  const credited = Number(invoice.creditedTotal ?? 0);
  if (credited <= 0) return 'none';
  return credited >= Number(invoice.total) - 0.01 ? 'full' : 'partial';
}

/** ¿Se puede acreditar o anular? Solo una factura emitida, con algo sin acreditar. */
export function canCreditInvoice(invoice: Pick<Invoice, 'status' | 'total' | 'creditedTotal'>): boolean {
  return (
    (invoice.status === 'ISSUED' || invoice.status === 'PAID') &&
    invoiceCreditState(invoice) !== 'full'
  );
}

export function canVoidInvoice(
  invoice: Pick<Invoice, 'status' | 'invoiceType' | 'creditedTotal' | 'total'>,
): boolean {
  return (
    (invoice.status === 'ISSUED' || invoice.status === 'PAID') &&
    invoice.invoiceType === 'SALE' &&
    invoiceCreditState(invoice) === 'none'
  );
}

export interface CreditDraftLine {
  quantity: number;
  restockQuantity: number;
  serialNumbers: string[];
}

/** Total de la nota según lo que se eligió acreditar. */
export function creditDraftTotal(
  kind: CreditNoteKind,
  items: CreditableInvoiceItem[],
  lines: Record<string, CreditDraftLine>,
  amount: number,
  remaining: number,
): number {
  if (kind === 'TOTAL') return remaining;
  if (kind === 'AMOUNT') return Number.isFinite(amount) ? amount : 0;
  return items.reduce(
    (sum, item) => sum + item.unitPrice * (lines[item.invoiceItemId]?.quantity ?? 0),
    0,
  );
}

/** Lo que descuenta de la deuda y lo que excede (y hay que resolver). */
export function creditSplit(total: number, outstanding: number) {
  const applied = Math.min(total, Math.max(outstanding, 0));
  return { applied, excess: Math.max(total - applied, 0) };
}

/** Por qué todavía no se puede emitir la nota, o null. */
export function creditDraftProblem(params: {
  kind: CreditNoteKind;
  reason: string;
  total: number;
  remaining: number;
  items: CreditableInvoiceItem[];
  lines: Record<string, CreditDraftLine>;
}): string | null {
  const { kind, reason, total, remaining, items, lines } = params;
  if (reason.trim().length < 3) return 'Escribí el motivo de la nota de crédito';
  if (kind === 'ITEMS' && total <= 0) return 'Elegí al menos un ítem para acreditar';
  if (kind === 'AMOUNT' && total <= 0) return 'Cargá el importe del descuento';
  if (total > remaining + 0.01) return 'La nota supera lo que queda por acreditar de la factura';
  for (const item of items) {
    const line = lines[item.invoiceItemId];
    if (!line) continue;
    const credited = kind === 'TOTAL' ? item.quantity : line.quantity;
    if (kind === 'ITEMS' && line.quantity > item.creditableQuantity) {
      return `De "${item.description}" se pueden acreditar hasta ${item.creditableQuantity} unidades`;
    }
    if (line.restockQuantity > credited) {
      return `De "${item.description}" vuelven al stock hasta ${credited} unidades`;
    }
    if (item.isSerialized && line.restockQuantity !== line.serialNumbers.length) {
      return `Elegí un número de serie por cada unidad de "${item.description}" que vuelve al stock`;
    }
  }
  return null;
}
