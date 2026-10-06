// Factura del proveedor. La cuenta por pagar nace estimada al recibir; la
// factura la vuelve definitiva. El servidor decide si coincide o necesita
// aprobación: acá va la vista previa de esa comparación y los textos.

export type SupplierInvoiceStatus =
  | 'MATCHED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

export const INVOICE_STATUS_LABEL: Record<SupplierInvoiceStatus, string> = {
  MATCHED: 'Coincide con lo recibido',
  PENDING_APPROVAL: 'Diferencia por aprobar',
  APPROVED: 'Diferencia aprobada',
  REJECTED: 'Rechazada',
};

/** Una línea recibida y lo que la factura dice de ella. */
export interface InvoiceLine {
  receiptItemId: string;
  productName: string;
  receivedQuantity: number;
  receivedUnitCost: number;
  quantity: number;
  unitCost: number;
}

export interface LineDifference {
  receiptItemId: string;
  productName: string;
  kind: 'quantity' | 'price';
  received: number;
  invoiced: number;
}

export interface InvoicePreview {
  subtotal: number;
  total: number;
  /** Lo estimado al recibir. */
  estimated: number;
  /** total − estimated; positivo = la factura es más cara. */
  difference: number;
  lineDifferences: LineDifference[];
  /** Cualquier diferencia, también envío o descuento, pide aprobación. */
  needsApproval: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const gs = (n: number) =>
  'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));

export function invoicePreview(
  lines: readonly InvoiceLine[],
  shipping: number,
  discount: number,
): InvoicePreview {
  const lineDifferences: LineDifference[] = [];
  let subtotal = 0;
  let estimated = 0;
  for (const line of lines) {
    subtotal += line.quantity * line.unitCost;
    estimated += line.receivedQuantity * line.receivedUnitCost;
    const base = { receiptItemId: line.receiptItemId, productName: line.productName };
    if (line.quantity !== line.receivedQuantity) {
      lineDifferences.push({
        ...base,
        kind: 'quantity',
        received: line.receivedQuantity,
        invoiced: line.quantity,
      });
    }
    if (Math.abs(line.unitCost - line.receivedUnitCost) > 0.005) {
      lineDifferences.push({
        ...base,
        kind: 'price',
        received: line.receivedUnitCost,
        invoiced: line.unitCost,
      });
    }
  }
  const total = round2(subtotal + shipping - discount);
  return {
    subtotal: round2(subtotal),
    total,
    estimated: round2(estimated),
    difference: round2(total - estimated),
    lineDifferences,
    needsApproval: lineDifferences.length > 0 || shipping > 0 || discount > 0,
  };
}

/** "Facturó 8, se recibieron 10" / "Facturó a Gs. 45.000, la orden decía Gs. 40.000". */
export function lineDifferenceLabel(difference: LineDifference): string {
  return difference.kind === 'quantity'
    ? `Facturó ${difference.invoiced}, se recibieron ${difference.received}`
    : `Facturó a ${gs(difference.invoiced)}, la orden decía ${gs(difference.received)}`;
}

/** "Gs. 25.000 más que lo estimado", "igual a lo estimado"... */
export function differenceLabel(difference: number): string {
  if (Math.abs(difference) < 0.01) return 'Igual a lo estimado';
  return `${gs(Math.abs(difference))} ${difference > 0 ? 'más' : 'menos'} que lo estimado`;
}

export interface InvoiceHeader {
  invoiceNumber: string;
  invoiceDate: string;
  shipping: number;
  discount: number;
}

/** Problema que impide cargar la factura, o null si se puede enviar. */
export function invoiceFormError(
  header: InvoiceHeader,
  lines: readonly InvoiceLine[],
): string | null {
  if (lines.length === 0) return 'Elegí al menos una recepción';
  if (!header.invoiceNumber.trim()) return 'Ingresá el número de la factura';
  if (!header.invoiceDate) return 'Ingresá la fecha de la factura';
  if (header.shipping < 0 || header.discount < 0) {
    return 'El envío y el descuento no pueden ser negativos';
  }
  const bad = lines.find(
    (line) =>
      !Number.isInteger(line.quantity) ||
      line.quantity < 0 ||
      !Number.isFinite(line.unitCost) ||
      line.unitCost < 0,
  );
  if (bad) {
    return `Revisá la cantidad y el precio de ${bad.productName}: la cantidad es un número entero y ninguno puede ser negativo`;
  }
  const preview = invoicePreview(lines, header.shipping, header.discount);
  if (preview.total < 0) return 'El descuento no puede superar lo facturado';
  return null;
}

/** En qué está una cuenta por pagar respecto de la factura del proveedor. */
export type PayableInvoiceState = 'estimated' | 'pending' | 'invoiced';

export function payableInvoiceState(payable: {
  supplierInvoice?: { status: SupplierInvoiceStatus } | null;
}): PayableInvoiceState {
  const status = payable.supplierInvoice?.status;
  if (!status || status === 'REJECTED') return 'estimated';
  return status === 'PENDING_APPROVAL' ? 'pending' : 'invoiced';
}

export const PAYABLE_INVOICE_LABEL: Record<PayableInvoiceState, string> = {
  estimated: 'Sin factura',
  pending: 'Diferencia por aprobar',
  invoiced: 'Facturada',
};

/**
 * Aviso al pagar una cuenta que todavía no está en firme. No bloquea: a un
 * proveedor se le puede pagar antes de que mande la factura.
 */
export function payBeforeInvoiceWarning(
  state: PayableInvoiceState,
): string | null {
  if (state === 'estimated') {
    return 'Esta cuenta todavía no tiene la factura del proveedor: el monto es una estimación de lo recibido y puede cambiar. Podés registrar el pago igual.';
  }
  if (state === 'pending') {
    return 'La factura de esta cuenta difiere de lo recibido y espera aprobación: el monto todavía es el estimado. Podés registrar el pago igual.';
  }
  return null;
}
