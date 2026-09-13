// Métodos de pago: espejo exacto del enum PaymentMethod de Prisma, que es lo
// que validan todos los endpoints de cobro (pagos, cuotas, cobranzas, POS,
// proveedores). Antes cada pantalla tenía su propia lista con valores que el
// backend no conoce (MOBILE, OTHER, DEPOSITO, CHEQUE) y el cobro fallaba.
export const PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'CARD',
  'PAGO_EXPRESS',
  'AQUI_PAGO',
  'CHECK',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia bancaria',
  CARD: 'Tarjeta (débito/crédito)',
  PAGO_EXPRESS: 'PagoExpress',
  AQUI_PAGO: 'AquíPago',
  CHECK: 'Cheque',
};

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return 'Sin método';
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;
}
