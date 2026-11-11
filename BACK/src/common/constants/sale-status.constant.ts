import { SaleOrderStatus } from '@prisma/client';

// Ventas cerradas, en cualquier punto del flujo: contado (cobrada → entregada),
// crédito (confirmada → facturada → entregada) y caja (nace entregada).
export const CLOSED_SALE_STATUSES: SaleOrderStatus[] = [
  SaleOrderStatus.PAYMENT_RECEIVED,
  SaleOrderStatus.CONFIRMED,
  SaleOrderStatus.INVOICED,
  SaleOrderStatus.DELIVERED,
];
