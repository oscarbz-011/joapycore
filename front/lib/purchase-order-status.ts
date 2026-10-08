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
  /** Cambiar la entrega estimada: mientras la orden espere mercadería. */
  delivery: boolean;
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
    delivery: status !== 'RECEIVED' && status !== 'CANCELLED',
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

/** Día de calendario (AAAA-MM-DD) de una fecha de la orden, guardada en UTC. */
export function orderCalendarDay(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

/**
 * Problema con la fecha de entrega que confirma el proveedor, o null si está
 * bien. Vacía es válida: la orden se confirma sin tocar la fecha que tenía.
 */
export function confirmDeliveryError(
  expectedDate: string,
  orderDate: string,
): string | null {
  if (!expectedDate) return null;
  return expectedDate < orderCalendarDay(orderDate)
    ? 'La fecha de entrega no puede ser anterior a la fecha de la orden'
    : null;
}

/**
 * Lo que se le pregunta a quien confirma la orden. La fecha de entrega no se
 * cambia sola: la persona dice si la que hay es correcta o carga otra.
 */
export interface DeliveryPrompt {
  question: string;
  /** Confirmar dejando la fecha como está. */
  keep: string;
  /** Pasar a cargar una fecha. */
  change: string;
}

export function deliveryPrompt(expectedDay: string): DeliveryPrompt {
  if (!expectedDay) {
    return {
      question:
        'Esta orden no tiene fecha de entrega estimada. ¿El proveedor te dio una?',
      keep: 'No, confirmar sin fecha',
      change: 'Sí, cargar la fecha',
    };
  }
  const [year, month, day] = expectedDay.split('-');
  return {
    question: `La entrega estimada es el ${day}/${month}/${year}. ¿La fecha es correcta?`,
    keep: 'Sí, es correcta',
    change: 'No, cambiar la fecha',
  };
}

/** Problema al confirmar con una fecha nueva, o null si está bien. */
export function changedDeliveryError(
  expectedDate: string,
  orderDate: string,
): string | null {
  if (!expectedDate) return 'Elegí la fecha de entrega';
  return confirmDeliveryError(expectedDate, orderDate);
}

/**
 * Entrega esperada de una orden creada el día `orderDay` (AAAA-MM-DD), según
 * el plazo de entrega del proveedor. Vacío si el proveedor no informó plazo.
 */
export function expectedDeliveryDay(
  orderDay: string,
  leadTimeDays: number | null | undefined,
): string {
  if (leadTimeDays === null || leadTimeDays === undefined || leadTimeDays < 0) {
    return '';
  }
  const [year, month, day] = orderDay.split('-').map(Number);
  if (!year || !month || !day) return '';
  // Días de calendario en UTC: sin corrimientos por zona horaria.
  return new Date(Date.UTC(year, month - 1, day + leadTimeDays))
    .toISOString()
    .slice(0, 10);
}
