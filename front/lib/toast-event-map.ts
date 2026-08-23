import { FileText, ShieldAlert, Wrench, Package, type LucideIcon } from 'lucide-react';

export interface ToastEventConfig {
  title: string;
  permission: string;
  module: string;
  href: string;
  icon: LucideIcon;
}

// Subconjunto curado de WS_EVENT_MAP — solo los eventos que representan un
// ítem *nuevo* entrando a la cola de pendientes de alguien (no resoluciones
// como "aprobado"/"rechazado", y no los que no tienen un evento discreto de
// "recién se venció" como Cuentas por cobrar/Compras, calculados por fecha
// en el cliente). Cada uno respeta el mismo permiso *y* módulo activo que ya
// gatean su badge en front/lib/use-pending-notifications.ts — sin el chequeo
// de módulo se dispara un aviso hacia un link muerto para cualquier tenant
// con ese módulo desactivado (encontrado en la verificación de esta feature
// con Logística, que no viene activo por defecto en un tenant nuevo).
export const TOAST_EVENT_MAP: Record<string, ToastEventConfig> = {
  'invoice.created': {
    title: 'Nueva factura pendiente de emitir',
    permission: 'billing:read',
    module: 'billing',
    href: '/dashboard/billing',
    icon: FileText,
  },
  'sale.credit.requested': {
    title: 'Nuevo pedido pendiente de evaluación de crédito',
    permission: 'sales:credit:evaluate',
    module: 'sales',
    href: '/dashboard/billing/approvals',
    icon: ShieldAlert,
  },
  'sale.credit.adjustment_requested': {
    title: 'Un pedido necesita ajustes',
    permission: 'sales:read',
    module: 'sales',
    href: '/dashboard/sales',
    icon: Wrench,
  },
  'delivery.note.created': {
    title: 'Nueva entrega pendiente de despacho',
    permission: 'logistics:read',
    module: 'logistics',
    href: '/dashboard/logistics/deliveries',
    icon: Package,
  },
};
