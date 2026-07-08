'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, X, Clock, CreditCard } from 'lucide-react';
import { salesApi, type SaleOrder } from '../../../../../lib/api/sales';
import { useAuth } from '../../../../../lib/auth-context';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function orderTotal(order: SaleOrder) {
  return order.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
}

// ── Reject modal ───────────────────────────────────────────────────────────────

function RejectModal({
  order,
  onClose,
}: {
  order: SaleOrder;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => salesApi.rejectCredit(order.id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-ink">Rechazar crédito</h3>
            <p className="text-xs text-muted mt-1">
              Pedido de {order.customer.firstName} {order.customer.lastName}
            </p>
          </div>
          <button onClick={onClose} className="ml-3 rounded-md p-1 text-faint hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-muted mb-1">
            Motivo del rechazo <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong resize-none"
            placeholder="Ej: Capacidad de pago insuficiente, historial de deuda..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {mutation.isError && (
          <p className="mb-3 text-xs text-red-600">
            {(mutation.error as Error & { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'Error al rechazar'}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => mutation.mutate()}
            disabled={reason.trim().length < 5 || mutation.isPending}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
          >
            {mutation.isPending ? 'Rechazando...' : 'Confirmar rechazo'}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border-strong bg-surface text-ink px-4 py-2 text-sm font-medium text-muted hover:bg-surface-2"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
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
      <div className="rounded-xl border border-border bg-surface p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="font-semibold text-ink">
              {order.customer.firstName} {order.customer.lastName}
            </p>
            {order.customer.email && (
              <p className="text-xs text-faint mt-0.5">{order.customer.email}</p>
            )}
            {order.customer.documentNumber && (
              <p className="text-xs text-faint">
                {order.customer.documentType ?? 'CI'}: {order.customer.documentNumber}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-bold text-ink">{formatPrice(total)}</p>
            <p className="text-xs text-faint mt-0.5">
              {order.installments ? `${order.installments} cuotas` : 'Sin cuotas'}
            </p>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-muted mb-4">
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {formatDate(order.orderDate)}
          </span>
          <span className="flex items-center gap-1">
            <CreditCard size={12} />
            Crédito
          </span>
          {seller && (
            <span>Vendedor: {seller.firstName} {seller.lastName}</span>
          )}
        </div>

        {/* Items */}
        <div className="rounded-lg bg-surface-2 p-3 mb-4 space-y-1">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-muted truncate flex-1">{item.product.name}</span>
              <span className="text-muted ml-4 shrink-0">
                {item.quantity} × {formatPrice(Number(item.unitPrice))}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle size={15} />
            {approveMutation.isPending ? 'Aprobando...' : 'Aprobar crédito'}
          </button>
          <button
            onClick={() => setShowReject(true)}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <XCircle size={15} />
            Rechazar
          </button>
        </div>

        {approveMutation.isError && (
          <p className="mt-2 text-xs text-red-600">
            {(approveMutation.error as Error & { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'Error al aprobar'}
          </p>
        )}
      </div>

      {showReject && (
        <RejectModal order={order} onClose={() => setShowReject(false)} />
      )}
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
        <p className="text-sm text-faint">No tenés permisos para acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Aprobaciones de crédito</h1>
        <p className="mt-1 text-sm text-muted">
          Pedidos de venta a crédito pendientes de evaluación antes de confirmar.
        </p>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-faint">Cargando...</div>
      ) : orders.length === 0 ? (
        <div className="py-24 text-center">
          <CheckCircle size={40} className="mx-auto mb-3 text-emerald-400" />
          <p className="text-base font-medium text-muted">Todo al día</p>
          <p className="text-sm text-faint mt-1">No hay pedidos pendientes de aprobación.</p>
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
