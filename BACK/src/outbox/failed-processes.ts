import type { Prisma } from '@prisma/client';

export type DocumentType =
  | 'invoice'
  | 'credit-note'
  | 'remission-note'
  | 'purchase-order'
  | 'delivery-note'
  | 'sale-order'
  | 'customer';

// Del más específico al más general: una factura también trae su pedido.
const DOCUMENT_KEYS: [string, DocumentType][] = [
  ['invoiceId', 'invoice'],
  ['creditNoteId', 'credit-note'],
  ['remissionNoteId', 'remission-note'],
  ['purchaseOrderId', 'purchase-order'],
  ['deliveryNoteId', 'delivery-note'],
  ['saleOrderId', 'sale-order'],
  ['customerId', 'customer'],
];

/** Solo el documento afectado: el resto del evento no sale del servidor. */
export function documentRefOf(
  payload: Prisma.JsonValue,
): { type: DocumentType; id: string } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  for (const [key, type] of DOCUMENT_KEYS) {
    const id = payload[key];
    if (typeof id === 'string' && id) return { type, id };
  }
  return null;
}
