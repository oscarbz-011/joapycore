import type { SaleOrderStatus } from './api/sales';

// La entrega de un pedido vista desde la venta. Con Logística activa la
// maneja Logística (nota de entrega, retiro, autorizaciones); sin Logística,
// Ventas la marca entregada directamente. El servidor valida lo mismo.

const DELIVERABLE: readonly SaleOrderStatus[] = [
  'CONFIRMED',
  'INVOICED',
  'PAYMENT_RECEIVED',
];

export type OrderDeliveryMode = 'logistics' | 'direct' | 'none';

export function orderDeliveryMode(input: {
  status: SaleOrderStatus;
  logisticsActive: boolean;
  permissions: readonly string[];
}): OrderDeliveryMode {
  if (input.logisticsActive) return 'logistics';
  if (!DELIVERABLE.includes(input.status)) return 'none';
  return input.permissions.includes('sales:update') ? 'direct' : 'none';
}
