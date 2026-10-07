// Anticipo a proveedores: lo que se paga de una orden de compra antes de
// recibir la mercadería. Un proveedor nuevo suele pedirlo, total o parcial,
// para despachar. No es una cuenta por pagar (esa nace al recibir): es plata
// adelantada que se descuenta de las cuentas por pagar de esa orden a medida
// que llega la mercadería.

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cuánto anticipo pide una orden. Manda el monto fijado en la orden; si no
 * hay, el porcentaje habitual del proveedor sobre el total.
 */
export function requiredAdvance(
  orderTotal: number,
  rule: { amount?: number | null; percent?: number | null },
): number {
  if (rule.amount != null) return round2(rule.amount);
  if (!rule.percent) return 0;
  return round2((orderTotal * rule.percent) / 100);
}

export interface AdvanceBalance {
  /** Lo que el proveedor pide por adelantado. */
  required: number;
  /** Anticipos pagados. */
  paid: number;
  /** Lo que el proveedor devolvió. */
  refunded: number;
  /** Lo ya descontado de cuentas por pagar de mercadería recibida. */
  applied: number;
  /** Saldo a favor con el proveedor: pagado, sin devolver ni aplicar. */
  available: number;
  /** Lo que falta pagar del anticipo requerido. */
  pending: number;
}

export function advanceBalance(input: {
  required: unknown;
  payments: readonly { kind: string; amount: unknown }[];
  applied: unknown;
}): AdvanceBalance {
  const sum = (kind: string) =>
    round2(
      input.payments
        .filter((payment) => payment.kind === kind)
        .reduce((total, payment) => total + Number(payment.amount), 0),
    );
  const required = round2(Number(input.required));
  const paid = sum('ADVANCE');
  const refunded = sum('ADVANCE_REFUND');
  const applied = round2(Number(input.applied));
  return {
    required,
    paid,
    refunded,
    applied,
    available: round2(paid - refunded - applied),
    pending: Math.max(0, round2(required - (paid - refunded))),
  };
}

/** Cuánto del saldo a favor se descuenta de una cuenta por pagar nueva. */
export function advanceToApply(available: number, payableAmount: number) {
  return round2(Math.max(0, Math.min(available, payableAmount)));
}

export function payableStatusAfterAdvance(
  applied: number,
  payableAmount: number,
): 'PENDING' | 'PARTIAL' | 'PAID' {
  if (applied <= 0) return 'PENDING';
  return applied >= payableAmount - 0.01 ? 'PAID' : 'PARTIAL';
}
