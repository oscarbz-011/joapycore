import type { FailedProcess, FailedProcessDocumentType } from './api/processes';

const PROCESS_LABELS: Record<string, string> = {
  'billing.invoice-from-order': 'Generar la factura de un pedido completado',
  'billing.invoice-from-payment': 'Generar la factura de un cobro',
  'billing.credit-note-pdf': 'Generar el PDF de una nota de crédito',
  'billing.remission-note-pdf': 'Generar el PDF de una nota de remisión',
  'communications.send-invoice': 'Enviar la factura por correo al cliente',
  'documents.sale-contract': 'Generar el contrato de una venta a crédito',
  'initial-data.module-activated': 'Cargar los datos iniciales de un módulo activado',
  'initial-data.tenant-registered': 'Cargar los datos iniciales de la empresa nueva',
  'finance.loan-from-credit': 'Crear el plan de cuotas de un crédito aprobado',
  'inventory.consume-lots': 'Descontar los lotes de una venta entregada',
  'inventory.stock-from-receipt': 'Ingresar al stock la mercadería recibida',
  'logistics.delivery-notes-on-activation': 'Crear las entregas pendientes al activar Logística',
  'logistics.note-from-order': 'Crear la entrega de un pedido',
  'logistics.note-from-payment': 'Crear la entrega de una venta cobrada',
  'logistics.route-progress': 'Actualizar el avance de la ruta de entrega',
  'payments.receivable-from-invoice': 'Crear la cuenta por cobrar de una factura',
  'procurement.payable-from-receipt': 'Crear la cuenta por pagar de una recepción',
  'sales.correct-customer-location': 'Actualizar la ubicación del cliente',
  'sales.deliver-order': 'Marcar la venta como entregada',
  'sales.mark-invoiced': 'Marcar el pedido como facturado',
  'sales.record-sold-batch': 'Anotar el lote vendido en la venta',
};

/** Qué hacía el proceso, en palabras de quien usa el sistema. */
export function processLabel(process: Pick<FailedProcess, 'consumer'>): string {
  if (!process.consumer) return 'Procesar un movimiento automático';
  return PROCESS_LABELS[process.consumer] ?? 'Proceso automático';
}

export const PROCESS_KIND_LABEL: Record<FailedProcess['kind'], string> = {
  STUCK: 'Agotó los reintentos',
  NOT_RETRIED: 'Falló sin reintento',
};

const DOCUMENTS: Record<
  FailedProcessDocumentType,
  { label: string; href: (id: string) => string }
> = {
  invoice: { label: 'Factura', href: (id) => `/dashboard/billing/invoices/${id}` },
  'credit-note': { label: 'Nota de crédito', href: (id) => `/dashboard/billing/credit-notes/${id}` },
  'remission-note': {
    label: 'Nota de remisión',
    href: (id) => `/dashboard/billing/remission-notes/${id}`,
  },
  'purchase-order': { label: 'Orden de compra', href: (id) => `/dashboard/procurement/orders/${id}` },
  'delivery-note': { label: 'Entrega', href: () => '/dashboard/logistics/deliveries' },
  'sale-order': { label: 'Venta', href: (id) => `/dashboard/sales/${id}` },
  customer: { label: 'Cliente', href: (id) => `/dashboard/sales/customers/${id}` },
};

export function processDocument(
  process: Pick<FailedProcess, 'document'>,
): { label: string; href: string } | null {
  if (!process.document) return null;
  const document = DOCUMENTS[process.document.type];
  return document ? { label: document.label, href: document.href(process.document.id) } : null;
}

/** Una fila por proceso: el mismo evento puede tener varios que fallaron. */
export function processKey(process: Pick<FailedProcess, 'eventId' | 'consumer'>): string {
  return `${process.eventId}:${process.consumer ?? ''}`;
}
