'use client';

import { useQuery } from '@tanstack/react-query';
import { billingApi } from './api/billing';
import { salesApi } from './api/sales';
import { paymentsApi } from './api/payments';
import { procurementApi } from './api/procurement';
import { logisticsApi } from './api/logistics';
import { daysOverdue } from './overdue';
import { arUrgency } from './ar-urgency';
import { orderTotal, formatPrice } from '../components/billing/credit-approval-shared';

export type PendingNotificationType =
  | 'invoice'
  | 'credit-approval'
  | 'overdue-ar'
  | 'ar-due-soon'
  | 'credit-adjustment'
  | 'purchase-order'
  | 'delivery';

export interface PendingNotification {
  id: string;
  type: PendingNotificationType;
  title: string;
  description: string;
  href: string;
}

function isOverdue(dueDate: string) {
  return daysOverdue(dueDate) > 0;
}

// Fuente única para los badges del sidebar y el detalle del dropdown de
// Alertas — mismas query keys que ya usan sus pantallas respectivas (se
// reutiliza la data en caché en vez de pedirla dos veces), y WS_EVENT_MAP ya
// invalida estas keys cuando ocurre el evento correspondiente, así ambos se
// actualizan solos.
//
// Cada query se gatea por permiso *y* por módulo activo — un permiso puede
// estar concedido aunque el módulo esté desactivado para el tenant (son
// conceptos independientes: @RequiredModule en el controller responde 403
// aunque @Permissions pase), así que sin el chequeo de módulo esto dispara
// pedidos condenados a fallar (403) para cualquier tenant con un módulo
// opcional apagado — encontrado en la verificación de esta misma feature
// con Logística, que no viene activo por defecto.
export function usePendingNotifications(permissions: string[], activeModules: string[], userId?: string) {
  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: billingApi.listInvoices,
    enabled: permissions.includes('billing:read') && activeModules.includes('billing'),
  });
  const pendingInvoices = invoices.filter((i) => i.status === 'PENDING');

  const { data: pendingApprovals = [] } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: salesApi.listPendingApprovals,
    enabled: permissions.includes('sales:credit:evaluate') && activeModules.includes('sales'),
  });

  // Al contado, "vencida" = pasó la fecha de la única factura, como
  // siempre. A crédito, NO se usa el AR.dueDate (queda fijo en la fecha de
  // la primera cuota y nunca se actualiza — con 6-12 cuotas mensuales por
  // cliente, esto marcaba como "vencida" a cualquier cuenta al día apenas
  // pasaba esa fecha inicial, puro ruido). Se mira la cuota real más
  // próxima sin pagar: vencida si esa cuota puntual está vencida, "por
  // vencer" si vence dentro de los próximos días — ver front/lib/ar-urgency.ts.
  const { data: arList = [] } = useQuery({
    queryKey: ['accounts-receivable'],
    queryFn: paymentsApi.listAR,
    enabled: permissions.includes('payments:read') && activeModules.includes('payments'),
  });
  const overdueAR = arList.filter((ar) => arUrgency(ar).level === 'overdue');
  const dueSoonAR = arList.filter((ar) => arUrgency(ar).level === 'due-soon');

  // Pedidos que el analista devolvió con pedido de ajuste — solo los que
  // creó/vendió el usuario actual, es una bandeja personal, no general como
  // "Evaluación de crédito" (esa la ve el analista, esta la ve el vendedor).
  const { data: myOrders = [] } = useQuery({
    queryKey: ['sale-orders'],
    queryFn: salesApi.listOrders,
    enabled: permissions.includes('sales:read') && activeModules.includes('sales') && !!userId,
  });
  const myAdjustments = myOrders.filter(
    (o) =>
      o.status === 'CREDIT_NEEDS_ADJUSTMENT' &&
      (o.seller ? o.seller.id === userId : o.createdBy?.id === userId),
  );

  // Órdenes de compra confirmadas/parcialmente recibidas cuya fecha de
  // entrega esperada ya pasó — mismo criterio "overdue-only" que Cuentas
  // por cobrar (esperar mercadería es el estado normal; solo avisa cuando
  // ya se pasó del plazo).
  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: procurementApi.listOrders,
    enabled: permissions.includes('procurement:read') && activeModules.includes('procurement'),
  });
  const overduePOs = purchaseOrders.filter(
    (po) =>
      (po.status === 'CONFIRMED' || po.status === 'PARTIALLY_RECEIVED') &&
      po.expectedDate &&
      isOverdue(po.expectedDate),
  );

  // Remitos listos para despachar — a diferencia de cuentas/compras, acá no
  // hay una fecha límite: "PENDING" ya significa "acción pendiente", como
  // las facturas sin emitir.
  const { data: pendingDeliveries = [] } = useQuery({
    queryKey: ['logistics-deliveries', 'PENDING'],
    queryFn: () => logisticsApi.listDeliveries('PENDING'),
    enabled: permissions.includes('logistics:read') && activeModules.includes('logistics'),
  });

  const counts = {
    invoices: pendingInvoices.length || undefined,
    approvals: pendingApprovals.length || undefined,
    overdueAR: (overdueAR.length + dueSoonAR.length) || undefined,
    myAdjustments: myAdjustments.length || undefined,
    overduePOs: overduePOs.length || undefined,
    pendingDeliveries: pendingDeliveries.length || undefined,
  };

  const items: PendingNotification[] = [
    ...pendingInvoices.map((inv) => ({
      id: `invoice-${inv.id}`,
      type: 'invoice' as const,
      title: 'Factura pendiente de emitir',
      description: `${inv.saleOrder.customer.firstName} ${inv.saleOrder.customer.lastName} · ${formatPrice(inv.total)}`,
      href: `/dashboard/billing/invoices/${inv.id}`,
    })),
    ...pendingApprovals.map((order) => ({
      id: `approval-${order.id}`,
      type: 'credit-approval' as const,
      title: 'Pedido a crédito pendiente de evaluación',
      description: `${order.customer.firstName} ${order.customer.lastName} · ${formatPrice(orderTotal(order))}`,
      href: `/dashboard/billing/approvals/${order.id}`,
    })),
    ...overdueAR.map((ar) => {
      const urgency = arUrgency(ar);
      const isCredit = ar.invoice.saleOrder.saleType === 'CREDIT';
      return {
        id: `ar-${ar.id}`,
        type: 'overdue-ar' as const,
        title: isCredit ? `Cuota ${urgency.installmentNumber} vencida` : 'Cuenta por cobrar vencida',
        description: `${ar.invoice.saleOrder.customer.firstName} ${ar.invoice.saleOrder.customer.lastName} · ${formatPrice(ar.amount - ar.paidAmount)}`,
        href: `/dashboard/payments?ar=${ar.id}`,
      };
    }),
    ...dueSoonAR.map((ar) => {
      const urgency = arUrgency(ar);
      return {
        id: `ar-due-soon-${ar.id}`,
        type: 'ar-due-soon' as const,
        title: `Cuota ${urgency.installmentNumber} vence en ${urgency.days} ${urgency.days === 1 ? 'día' : 'días'}`,
        description: `${ar.invoice.saleOrder.customer.firstName} ${ar.invoice.saleOrder.customer.lastName}`,
        href: `/dashboard/payments?ar=${ar.id}`,
      };
    }),
    ...myAdjustments.map((order) => ({
      id: `adjustment-${order.id}`,
      type: 'credit-adjustment' as const,
      title: 'Tu pedido necesita un ajuste',
      description: `${order.customer.firstName} ${order.customer.lastName}${order.adjustmentNote ? ` · ${order.adjustmentNote}` : ''}`,
      href: `/dashboard/sales/${order.id}/adjust`,
    })),
    ...overduePOs.map((po) => ({
      id: `po-${po.id}`,
      type: 'purchase-order' as const,
      title: 'Entrega de compra vencida',
      description: `${po.supplier.name} · ${formatPrice(po.items.reduce((s, i) => s + i.quantity * i.unitCost, 0))}`,
      href: `/dashboard/procurement/orders/${po.id}`,
    })),
    ...pendingDeliveries.map((d) => ({
      id: `delivery-${d.id}`,
      type: 'delivery' as const,
      title: 'Entrega pendiente de despacho',
      description: `${d.saleOrder.customer.firstName} ${d.saleOrder.customer.lastName} · #${d.saleOrder.id.slice(0, 8).toUpperCase()}`,
      href: `/dashboard/logistics/deliveries`,
    })),
  ];

  return { counts, items };
}
