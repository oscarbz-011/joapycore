'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, XCircle, Wrench, Clock, CreditCard } from 'lucide-react';
import { salesApi } from '../../../../../../lib/api/sales';
import {
  formatPrice,
  formatDate,
  orderBase,
  orderTotal,
  itemPrice,
  CreditHistorySection,
  RejectModal,
  AdjustmentModal,
} from '../../../../../../components/billing/credit-approval-shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showReject, setShowReject] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['sale-order', id],
    queryFn: () => salesApi.getOrder(id),
  });

  const approveMutation = useMutation({
    mutationFn: () => salesApi.approveCredit(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      router.push('/dashboard/billing/approvals');
    },
  });

  function backToList() {
    void queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
    router.push('/dashboard/billing/approvals');
  }

  if (isLoading) {
    return <div className="py-24 text-center text-sm text-muted-foreground/60">Cargando pedido...</div>;
  }

  if (error || !order) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground/60">No se encontró el pedido.</p>
        <button onClick={() => router.push('/dashboard/billing/approvals')} className="mt-3 text-sm font-medium text-foreground underline underline-offset-2">
          Volver
        </button>
      </div>
    );
  }

  const seller = order.seller ?? order.createdBy;
  const total = orderTotal(order);
  const subtotal = orderBase(order);
  const canDecide = order.status === 'PENDING_CREDIT_APPROVAL';

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.push('/dashboard/billing/approvals')}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} />
        Aprobaciones de crédito
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {order.customer.firstName} {order.customer.lastName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {order.customer.email && <span>{order.customer.email}</span>}
            {order.customer.documentNumber && (
              <span>{order.customer.documentType ?? 'CI'}: {order.customer.documentNumber}</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock size={12} />{formatDate(order.orderDate)}</span>
            <span className="flex items-center gap-1"><CreditCard size={12} />Crédito</span>
            {seller && <span>Vendedor: {seller.firstName} {seller.lastName}</span>}
          </div>
        </div>
        {!canDecide && (
          <Badge variant="outline">{order.status}</Badge>
        )}
      </div>

      {/* Items */}
      <div className="rounded-2xl border border-border bg-card mb-6">
        <div className="border-b border-border px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Productos</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{item.product?.name ?? item.description ?? 'Ítem'}</p>
                {item.product?.model && <p className="text-xs text-muted-foreground">{item.product.model}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm text-muted-foreground">{item.quantity} × {formatPrice(itemPrice(item))}</p>
                <p className="text-sm font-medium text-foreground">{formatPrice(item.quantity * itemPrice(item))}</p>
              </div>
            </div>
          ))}

          {order.surchargeAmount != null && order.surchargeType && (
            <div className="flex justify-between text-xs text-warn pt-2 border-t border-border">
              <span>Recargo{order.surchargeReason ? ` — ${order.surchargeReason}` : ''}{order.surchargeType === 'PERCENTAGE' ? ` (${order.surchargeAmount}%)` : ''}</span>
              <span className="font-mono tabular-nums">+{formatPrice(total - subtotal)}</span>
            </div>
          )}

          <div className="flex justify-between items-center border-t border-border pt-3">
            <span className="text-sm font-semibold text-muted-foreground">Total</span>
            <span className="text-lg font-bold text-foreground">{formatPrice(total)}</span>
          </div>
          {order.installments ? (
            <p className="text-xs text-muted-foreground text-right">
              {order.installments} cuotas de ≈ {formatPrice(Math.ceil(total / order.installments))}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground text-right">Sin cuotas</p>
          )}
        </div>
      </div>

      {order.notes && (
        <div className="rounded-2xl border border-border bg-card mb-6 px-5 py-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Notas del pedido</p>
          <p className="text-sm text-muted-foreground">{order.notes}</p>
        </div>
      )}

      {order.guarantors.length > 0 && (
        <div className="rounded-2xl border border-border bg-card mb-6">
          <div className="border-b border-border px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Garantes</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {order.guarantors.map((g) => (
              <div key={g.id} className="text-sm">
                <p className="text-foreground">{g.firstName} {g.lastName}</p>
                <p className="text-xs text-muted-foreground">
                  {g.documentType}: {g.documentNumber}
                  {g.phone ? ` · ${g.phone}` : ''}
                  {g.monthlyIncome != null ? ` · Ingreso: ${formatPrice(g.monthlyIncome)}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full, non-collapsed credit history */}
      <CreditHistorySection order={order} collapsible={false} />

      {/* Actions */}
      {canDecide && (
        <div className="mt-6 space-y-2">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
          >
            <CheckCircle size={15} />
            {approveMutation.isPending ? 'Aprobando...' : 'Aprobar crédito'}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 border-amber-300/50 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
              onClick={() => setShowAdjustment(true)}
            >
              <Wrench size={15} />
              Necesita ajustes
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setShowReject(true)}
            >
              <XCircle size={15} />
              Rechazar
            </Button>
          </div>
          {approveMutation.isError && (
            <p className="text-xs text-destructive">
              {(approveMutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al aprobar'}
            </p>
          )}
        </div>
      )}

      <RejectModal order={order} open={showReject} onOpenChange={setShowReject} onSuccess={backToList} />
      <AdjustmentModal order={order} open={showAdjustment} onOpenChange={setShowAdjustment} onSuccess={backToList} />
    </div>
  );
}
