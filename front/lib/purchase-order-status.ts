import type { PurchaseOrderStatus } from './api/procurement';

export const PURCHASE_ORDER_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  PENDING: 'Borrador',
  SENT: 'Enviada',
  CONFIRMED: 'Confirmada',
  PARTIALLY_RECEIVED: 'Recepción parcial',
  RECEIVED: 'Recibida',
  CANCELLED: 'Cancelada',
};

/** Orden en que se ofrecen los estados en filtros. */
export const PURCHASE_ORDER_STATUSES = Object.keys(
  PURCHASE_ORDER_STATUS_LABEL,
) as PurchaseOrderStatus[];

export interface OrderActions {
  send: boolean;
  confirm: boolean;
  cancel: boolean;
  receive: boolean;
}

// Mismas reglas que valida el backend (PurchaseOrdersService): acá solo
// deciden qué botones se muestran.
export function orderActions(status: PurchaseOrderStatus): OrderActions {
  return {
    send: status === 'PENDING',
    // También desde borrador: el proveedor puede confirmar por teléfono.
    confirm: status === 'PENDING' || status === 'SENT',
    cancel: status === 'PENDING' || status === 'SENT' || status === 'CONFIRMED',
    receive: status === 'CONFIRMED' || status === 'PARTIALLY_RECEIVED',
  };
}

const ENTRY_LABEL: Record<PurchaseOrderStatus, string> = {
  PENDING: 'Orden creada',
  SENT: 'Enviada al proveedor',
  CONFIRMED: 'Confirmada por el proveedor',
  PARTIALLY_RECEIVED: 'Recepción parcial de mercadería',
  RECEIVED: 'Mercadería recibida por completo',
  CANCELLED: 'Orden cancelada',
};

export function historyEntryLabel(change: {
  fromStatus: PurchaseOrderStatus | null;
  toStatus: PurchaseOrderStatus;
}): string {
  return ENTRY_LABEL[change.toStatus];
}

const MIN_REASON_LENGTH = 3;

export function cancelReasonError(reason: string): string | null {
  return reason.trim().length < MIN_REASON_LENGTH
    ? 'Indicá el motivo de la cancelación'
    : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida la dirección a la que se manda la orden; null si está bien. */
export function orderEmailError(to: string): string | null {
  const value = to.trim();
  if (!value) return 'Indicá a qué dirección enviar la orden';
  return EMAIL.test(value) ? null : 'La dirección de email no es válida';
}
