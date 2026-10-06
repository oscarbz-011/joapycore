// Anticipo a proveedores: lo que se paga de una orden de compra antes de
// recibir la mercadería. Los saldos los calcula el servidor; acá va lo que
// necesita la pantalla para pedir los datos y explicar el estado.

/** Saldo del anticipo de una orden, tal como lo informa la API. */
export interface OrderAdvance {
  /** Lo que el proveedor pide por adelantado. */
  required: number;
  paid: number;
  refunded: number;
  /** Ya descontado de cuentas por pagar de mercadería recibida. */
  applied: number;
  /** Saldo a favor con el proveedor: pagado, sin devolver ni aplicar. */
  available: number;
  /** Lo que falta pagar del anticipo requerido. */
  pending: number;
}

export type AdvanceMovementKind = 'ADVANCE' | 'ADVANCE_REFUND';

const round2 = (n: number) => Math.round(n * 100) / 100;
const gs = (n: number) =>
  'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));

/** El monto que representa un porcentaje del total de la orden. */
export function advanceFromPercent(total: number, percent: number): number {
  if (!(total > 0) || !(percent > 0)) return 0;
  return Math.round((total * percent) / 100);
}

/** Qué porcentaje del total es un monto; 0 si todavía no hay total. */
export function percentOfTotal(total: number, amount: number): number {
  if (!(total > 0) || !(amount > 0)) return 0;
  return round2((amount / total) * 100);
}

/** "30%", "Pago total" o "No pide" para el anticipo habitual del proveedor. */
export function advancePercentLabel(percent: number | null): string {
  if (!percent) return 'No pide';
  if (percent >= 100) return 'Pago total por adelantado';
  return `${new Intl.NumberFormat('es-PY').format(percent)}% de la orden`;
}

/** Problema con el anticipo que pide una orden, o null si está bien. */
export function requiredAdvanceError(
  amount: number,
  orderTotal: number,
): string | null {
  if (!Number.isFinite(amount) || amount < 0) {
    return 'El anticipo no puede ser negativo';
  }
  if (amount > orderTotal + 0.01) {
    return `El anticipo no puede superar el total de la orden (${gs(orderTotal)})`;
  }
  return null;
}

/** Cuánto más se le puede adelantar al proveedor por esta orden. */
export function advanceRoom(advance: OrderAdvance, orderTotal: number): number {
  return Math.max(0, round2(orderTotal - (advance.paid - advance.refunded)));
}

/** Monto que se propone al abrir el formulario de un movimiento. */
export function suggestedMovementAmount(
  kind: AdvanceMovementKind,
  advance: OrderAdvance,
  orderTotal: number,
): number {
  if (kind === 'ADVANCE_REFUND') return Math.round(advance.available);
  const room = advanceRoom(advance, orderTotal);
  return Math.round(advance.pending > 0 ? Math.min(advance.pending, room) : room);
}

/** Problema con un pago o una devolución de anticipo, o null si está bien. */
export function advanceMovementError(
  kind: AdvanceMovementKind,
  amount: number,
  advance: OrderAdvance,
  orderTotal: number,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Ingresá un monto mayor a cero';
  }
  if (kind === 'ADVANCE') {
    const room = advanceRoom(advance, orderTotal);
    return amount > room + 0.01
      ? `El anticipo no puede superar el total de la orden: quedan ${gs(room)} por adelantar`
      : null;
  }
  return amount > advance.available + 0.01
    ? `La devolución supera el saldo a favor con el proveedor (${gs(advance.available)})`
    : null;
}

export type AdvanceState = 'none' | 'pending' | 'partial' | 'covered';

/** En qué quedó el anticipo que pide la orden. */
export function advanceState(advance: OrderAdvance): AdvanceState {
  if (advance.required <= 0 && advance.paid - advance.refunded <= 0) {
    return 'none';
  }
  if (advance.pending <= 0) return 'covered';
  return advance.paid - advance.refunded > 0 ? 'partial' : 'pending';
}

export const ADVANCE_STATE_LABEL: Record<AdvanceState, string> = {
  none: 'Sin anticipo',
  pending: 'Anticipo pendiente',
  partial: 'Anticipo parcial',
  covered: 'Anticipo pagado',
};

/**
 * Aviso al recibir mercadería con el anticipo sin completar. No bloquea: el
 * proveedor puede haber despachado igual.
 */
export function receiveAdvanceWarning(
  advance: OrderAdvance | undefined,
): string | null {
  if (!advance || advance.pending <= 0) return null;
  return `Esta orden pide un anticipo de ${gs(advance.required)} y faltan pagar ${gs(advance.pending)}. Podés registrar la recepción igual.`;
}

/** Aviso al cancelar: el servidor no deja hasta registrar la devolución. */
export function cancelAdvanceBlock(
  advance: OrderAdvance | undefined,
): string | null {
  if (!advance || advance.available <= 0.01) return null;
  return `El proveedor tiene ${gs(advance.available)} de anticipo. Registrá su devolución antes de cancelar la orden.`;
}

/**
 * El anticipo de una orden que se está armando: se carga como porcentaje o
 * como monto, y el otro se calcula. Como porcentaje sigue al total mientras
 * se agregan líneas; como monto queda fijo.
 */
export interface AdvanceDraft {
  mode: 'percent' | 'amount';
  /** Lo que se tipeó; vacío = sin anticipo. */
  value: string;
}

export function supplierAdvanceDraft(percent: number | null): AdvanceDraft {
  return { mode: 'percent', value: percent ? String(percent) : '' };
}

export function resolveAdvanceDraft(
  draft: AdvanceDraft,
  total: number,
): { amount: number; percent: number } {
  const typed = Number(draft.value.replace(',', '.'));
  const value = Number.isFinite(typed) ? typed : 0;
  return draft.mode === 'percent'
    ? { amount: advanceFromPercent(total, value), percent: value }
    : { amount: value, percent: percentOfTotal(total, value) };
}

/** Problema con el anticipo de una orden nueva, o null si está bien. */
export function advanceDraftError(
  draft: AdvanceDraft,
  total: number,
): string | null {
  const { amount, percent } = resolveAdvanceDraft(draft, total);
  if (draft.mode === 'percent' && (percent < 0 || percent > 100)) {
    return 'El anticipo tiene que estar entre 0% y 100% de la orden';
  }
  return requiredAdvanceError(amount, total);
}
