'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import {
  paymentsApi,
  PAYMENT_METHOD_LABELS,
  type AccountsReceivable,
  type ARStatus,
  type PaymentMethod,
  type RegisterPaymentPayload,
} from '../../../../lib/api/payments';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<ARStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'bg-amber-50 text-amber-700' },
  PARTIAL:  { label: 'Parcial',   className: 'bg-blue-50 text-blue-700' },
  PAID:     { label: 'Pagado',    className: 'bg-emerald-50 text-emerald-700' },
  CANCELLED:{ label: 'Cancelado', className: 'bg-slate-100 text-slate-500' },
};

function StatusBadge({ status }: { status: ARStatus }) {
  const { label, className } = STATUS_MAP[status];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// ── Register payment modal ─────────────────────────────────────────────────────

function RegisterPaymentModal({
  ar,
  onClose,
  onSaved,
}: {
  ar: AccountsReceivable;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const remaining = Number(ar.amount) - Number(ar.paidAmount);

  const [amount, setAmount] = useState(String(Math.round(remaining)));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const dto: RegisterPaymentPayload = {
        amount: Number(amount),
        paymentMethod: method,
        paymentDate: date,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      return paymentsApi.registerPayment(ar.id, dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts-receivable'] });
      onSaved();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al registrar el pago'));
    },
  });

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';
  const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Registrar pago</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {ar.invoice.saleOrder.customer.firstName} {ar.invoice.saleOrder.customer.lastName}
              {' · '}Saldo: {formatPrice(remaining)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}
          className="px-6 py-5 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Monto (PYG) *</label>
              <input
                type="number"
                min={1}
                max={remaining}
                className={inputCls}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Fecha *</label>
              <input
                type="date"
                className={inputCls}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Método de pago *</label>
            <select
              className={inputCls}
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((key) => (
                <option key={key} value={key}>{PAYMENT_METHOD_LABELS[key]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Referencia / Comprobante</label>
            <input
              className={inputCls}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="N° transferencia, cheque..."
            />
          </div>

          <div>
            <label className={labelCls}>Notas</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Registrando...' : 'Confirmar pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── AR detail panel ────────────────────────────────────────────────────────────

function ARDetailPanel({
  ar,
  onClose,
}: {
  ar: AccountsReceivable;
  onClose: () => void;
}) {
  const [showRegister, setShowRegister] = useState(false);
  const queryClient = useQueryClient();

  const remaining = Number(ar.amount) - Number(ar.paidAmount);
  const pct = Number(ar.amount) > 0 ? (Number(ar.paidAmount) / Number(ar.amount)) * 100 : 0;

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <aside className="relative z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-900">
                  {ar.invoice.saleOrder.customer.firstName} {ar.invoice.saleOrder.customer.lastName}
                </p>
                <StatusBadge status={ar.status} />
              </div>
              {ar.invoice.saleOrder.customer.email && (
                <p className="text-xs text-slate-400 mt-0.5">{ar.invoice.saleOrder.customer.email}</p>
              )}
              <p className="text-xs text-slate-400 mt-0.5">
                Factura #{ar.invoice.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-3 shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>

          {/* Amounts */}
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Saldo</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Total factura</span>
                <span className="font-medium text-slate-800">{formatPrice(Number(ar.amount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pagado</span>
                <span className="font-medium text-emerald-600">{formatPrice(Number(ar.paidAmount))}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="font-semibold text-slate-700">Saldo pendiente</span>
                <span className="font-bold text-slate-900">{formatPrice(remaining)}</span>
              </div>
            </div>
            {ar.dueDate && (
              <p className="text-xs text-slate-400 mt-2">Vencimiento: {formatDate(ar.dueDate)}</p>
            )}
          </div>

          {/* Payment history */}
          {ar.paymentRecords.length > 0 && (
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Historial de pagos
              </p>
              <div className="space-y-2">
                {ar.paymentRecords.map((pr) => (
                  <div key={pr.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-800">
                        {formatPrice(Number(pr.amount))}
                      </span>
                      <span className="text-xs text-slate-500">{formatDate(pr.paymentDate)}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {PAYMENT_METHOD_LABELS[pr.paymentMethod]}
                      {pr.reference ? ` · ${pr.reference}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action */}
          {(ar.status === 'PENDING' || ar.status === 'PARTIAL') && (
            <div className="px-5 py-4">
              <button
                onClick={() => setShowRegister(true)}
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Registrar pago
              </button>
            </div>
          )}
        </aside>
      </div>

      {showRegister && (
        <RegisterPaymentModal
          ar={ar}
          onClose={() => setShowRegister(false)}
          onSaved={() => {
            setShowRegister(false);
            void queryClient.invalidateQueries({ queryKey: ['accounts-receivable'] });
            onClose();
          }}
        />
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [statusFilter, setStatusFilter] = useState<'' | ARStatus>('');
  const [selectedAR, setSelectedAR] = useState<AccountsReceivable | null>(null);

  const { data: arList = [], isLoading } = useQuery({
    queryKey: ['accounts-receivable'],
    queryFn: paymentsApi.listAR,
  });

  const filtered = statusFilter ? arList.filter((ar) => ar.status === statusFilter) : arList;

  const selectCls =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 bg-white';

  const totalPending = arList
    .filter((ar) => ar.status === 'PENDING' || ar.status === 'PARTIAL')
    .reduce((sum, ar) => sum + Number(ar.amount) - Number(ar.paidAmount), 0);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pagos</h1>
          <p className="mt-1 text-sm text-slate-500">Cuentas por cobrar y registro de pagos</p>
        </div>
        {totalPending > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-right">
            <p className="text-xs text-amber-600 font-medium">Total pendiente</p>
            <p className="text-lg font-bold text-amber-800">{formatPrice(totalPending)}</p>
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select
          className={selectCls}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | ARStatus)}
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="PARTIAL">Parcial</option>
          <option value="PAID">Pagado</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-slate-400">Cargando cuentas por cobrar...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-slate-400">
            {arList.length === 0
              ? 'Las cuentas por cobrar se generan automáticamente al emitir una factura.'
              : 'No se encontraron cuentas con los filtros aplicados.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Vencimiento</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Pagado</th>
                <th className="px-4 py-3 text-right">Pendiente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((ar) => {
                const pending = Number(ar.amount) - Number(ar.paidAmount);
                return (
                  <tr
                    key={ar.id}
                    onClick={() => setSelectedAR(ar)}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {ar.invoice.saleOrder.customer.firstName}{' '}
                        {ar.invoice.saleOrder.customer.lastName}
                      </div>
                      {ar.invoice.saleOrder.customer.email && (
                        <div className="text-xs text-slate-400">
                          {ar.invoice.saleOrder.customer.email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(ar.dueDate)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ar.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                      {formatPrice(Number(ar.amount))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600">
                      {formatPrice(Number(ar.paidAmount))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-900">
                      {formatPrice(pending)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedAR && (
        <ARDetailPanel ar={selectedAR} onClose={() => setSelectedAR(null)} />
      )}
    </div>
  );
}
