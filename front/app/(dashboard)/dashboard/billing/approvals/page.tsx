'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Clock, CreditCard } from 'lucide-react';
import { salesApi, type SaleOrder } from '../../../../../lib/api/sales';
import { useAuth } from '../../../../../lib/auth-context';
import {
  formatPrice,
  formatDate,
  orderTotal,
  itemPrice,
} from '../../../../../components/billing/credit-approval-shared';

// ── Order card ─────────────────────────────────────────────────────────────────
// Solo resume — aprobar/rechazar/pedir ajustes y el historial crediticio
// completo viven en el detalle (mismo patrón que las listas de Inventario y
// Clientes: la fila lleva a una vista de página completa, no repite ahí las
// acciones).

function OrderCard({ order }: { order: SaleOrder }) {
  const router = useRouter();
  const seller = order.seller ?? order.createdBy;
  const total = orderTotal(order);

  return (
    <button
      type="button"
      onClick={() => router.push(`/dashboard/billing/approvals/${order.id}`)}
      className="text-left rounded-xl border border-border bg-card p-5 hover:border-ring/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">
            {order.customer.firstName} {order.customer.lastName}
          </p>
          {order.customer.email && <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{order.customer.email}</p>}
          {order.customer.documentNumber && (
            <p className="text-xs text-muted-foreground/60 truncate">
              {order.customer.documentType ?? 'CI'}: {order.customer.documentNumber}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold text-foreground">{formatPrice(total)}</p>
          {order.installments ? (
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {order.installments} cuotas · {formatPrice(Math.ceil(total / order.installments))}/mes
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/60 mt-0.5">Sin cuotas</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {formatDate(order.orderDate)}
        </span>
        <span className="flex items-center gap-1">
          <CreditCard size={12} />
          Crédito
        </span>
        {seller && <span>Vendedor: {seller.firstName} {seller.lastName}</span>}
      </div>

      <div className="rounded-xl bg-muted/30 p-3 space-y-1">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-muted-foreground truncate flex-1">{item.product?.name ?? item.description ?? 'Ítem'}</span>
            <span className="text-muted-foreground ml-4 shrink-0 tabular-nums">
              {item.quantity} × {formatPrice(itemPrice(item))}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { jwtPayload } = useAuth();
  const canManage = jwtPayload?.permissions.includes('sales:credit:evaluate') ?? false;

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: salesApi.listPendingApprovals,
    enabled: canManage,
  });

  if (!canManage) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground/60">No tenés permisos para acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Aprobaciones de crédito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pedidos de venta a crédito pendientes de evaluación antes de confirmar.
        </p>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando...</div>
      ) : orders.length === 0 ? (
        <div className="py-24 text-center">
          <CheckCircle size={40} className="mx-auto mb-3 text-emerald-400" />
          <p className="text-base font-medium text-muted-foreground">Todo al día</p>
          <p className="text-sm text-muted-foreground/60 mt-1">No hay pedidos pendientes de aprobación.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
