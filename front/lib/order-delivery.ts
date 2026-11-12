import type { SaleOrderStatus } from './api/sales';

// Sin Logística, Ventas marca entregado un pedido confirmado, facturado o
// cobrado. Con Logística activa la entrega la maneja Logística (ver el lugar
// sale-order.delivery en front/modules). El servidor valida lo mismo.

const DELIVERABLE: readonly SaleOrderStatus[] = [
  'CONFIRMED',
  'INVOICED',
  'PAYMENT_RECEIVED',
];

export function canDeliverDirectly(input: {
  status: SaleOrderStatus;
  permissions: readonly string[];
}): boolean {
  return DELIVERABLE.includes(input.status) && input.permissions.includes('sales:update');
}
