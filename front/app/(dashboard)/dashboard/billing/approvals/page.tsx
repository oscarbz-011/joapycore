'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, X, Clock, CreditCard } from 'lucide-react';
import { salesApi, type SaleOrder } from '../../../../../lib/api/sales';
import { useAuth } from '../../../../../lib/auth-context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function orderBase(order: SaleOrder) {
  return order.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
}

function orderTotal(order: SaleOrder) {
  if (order.saleType === 'CREDIT') {
    if (order.loan?.totalAmount) return Number(order.loan.totalAmount);
    if (order.interestRate) return orderBase(order) * (1 + Number(order.interestRate) / 100);
  }
  return orderBase(order);
}

const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

// ── Reject modal ───────────────────────────────────────────────────────────────

function RejectModal({ order, open, onOpenChange }: { order: SaleOrder; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => salesApi.rejectCredit(order.id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      setReason('');
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md p-0">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <DialogTitle>Rechazar crédito</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Pedido de {order.customer.firstName} {order.customer.lastName}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Motivo del rechazo <span className="text-destructive">*</span></Label>
            <textarea
              rows={3}
              className={TEXTAREA_CLS}
              placeholder="Ej: Capacidad de pago insuficiente, historial de deuda..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al rechazar'}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => mutation.mutate()}
              disabled={reason.trim().length < 5 || mutation.isPending}
            >
              {mutation.isPending ? 'Rechazando...' : 'Confirmar rechazo'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Order card ─────────────────────────────────────────────────────────────────

function OrderCard({ order }: { order: SaleOrder }) {
  const queryClient = useQueryClient();
  const [showReject, setShowReject] = useState(false);

  const approveMutation = useMutation({
    mutationFn: () => salesApi.approveCredit(order.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
    },
  });

  const seller = order.seller ?? order.createdBy;
  const total = orderTotal(order);

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="font-semibold text-foreground">
              {order.customer.firstName} {order.customer.lastName}
            </p>
            {order.customer.email && <p className="text-xs text-muted-foreground/60 mt-0.5">{order.customer.email}</p>}
            {order.customer.documentNumber && (
              <p className="text-xs text-muted-foreground/60">
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

        <div className="rounded-xl bg-muted/30 p-3 mb-4 space-y-1">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-muted-foreground truncate flex-1">{item.product.name}</span>
              <span className="text-muted-foreground ml-4 shrink-0 tabular-nums">
                {item.quantity} × {formatPrice(Number(item.unitPrice))}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
          >
            <CheckCircle size={15} />
            {approveMutation.isPending ? 'Aprobando...' : 'Aprobar crédito'}
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
          <p className="mt-2 text-xs text-destructive">
            {(approveMutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al aprobar'}
          </p>
        )}
      </div>

      <RejectModal order={order} open={showReject} onOpenChange={setShowReject} />
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { jwtPayload } = useAuth();
  const canManage = jwtPayload?.permissions.includes('sales:manage') ?? false;

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
