'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { billingApi, type Invoice, type InvoiceStatus } from '../../../../lib/api/billing';

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

const STATUS_MAP: Record<InvoiceStatus, { label: string; className: string }> = {
  PENDING:     { label: 'Borrador',  className: 'bg-slate-100 text-slate-600' },
  ISSUED:    { label: 'Emitida',   className: 'bg-blue-50 text-blue-700' },
  PAID:      { label: 'Pagada',    className: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'Cancelada', className: 'bg-red-50 text-red-600' },
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, className } = STATUS_MAP[status];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function InvoiceDetailPanel({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const cancelMutation = useMutation({
    mutationFn: () => billingApi.cancelInvoice(invoice.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setConfirmCancel(false);
      onClose();
    },
  });

  const canCancel = invoice.status === 'PENDING' || invoice.status === 'ISSUED';

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-900">
                {invoice.saleOrder.customer.firstName} {invoice.saleOrder.customer.lastName}
              </p>
              <StatusBadge status={invoice.status} />
            </div>
            {invoice.saleOrder.customer.email && (
              <p className="text-xs text-slate-400 mt-0.5">{invoice.saleOrder.customer.email}</p>
            )}
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              #{invoice.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Dates */}
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Fechas
          </p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Creada</span>
              <span className="text-slate-700">{formatDate(invoice.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Emitida</span>
              <span className="text-slate-700">{formatDate(invoice.issuedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Vencimiento</span>
              <span className="text-slate-700">{formatDate(invoice.dueDate)}</span>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Detalle
          </p>
          <div className="space-y-2">
            {invoice.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 truncate">{item.description}</p>
                  <p className="text-xs text-slate-400">
                    {item.quantity} × {formatPrice(Number(item.unitPrice))}
                    {item.ivaRate ? ` · IVA ${item.ivaRate}%` : ''}
                  </p>
                </div>
                <span className="text-sm font-medium text-slate-800 shrink-0">
                  {formatPrice(Number(item.total))}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center border-t border-slate-100 mt-3 pt-3">
            <span className="text-sm font-semibold text-slate-700">Total</span>
            <span className="text-base font-bold text-slate-900">{formatPrice(Number(invoice.total))}</span>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Notas</p>
            <p className="text-sm text-slate-600">{invoice.notes}</p>
          </div>
        )}

        {/* Cancel action */}
        {canCancel && (
          <div className="px-5 py-4">
            {!confirmCancel ? (
              <button
                onClick={() => setConfirmCancel(true)}
                className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Cancelar factura
              </button>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs text-red-700 mb-2">¿Cancelar esta factura?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancelMutation.isPending ? 'Cancelando...' : 'Sí, cancelar'}
                  </button>
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Volver
                  </button>
                </div>
                {cancelMutation.isError && (
                  <p className="mt-2 text-xs text-red-700">
                    {(cancelMutation.error as Error & { response?: { data?: { message?: string } } })
                      ?.response?.data?.message ?? 'Error al cancelar'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [statusFilter, setStatusFilter] = useState<'' | InvoiceStatus>('');
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: billingApi.listInvoices,
  });

  const filtered = invoices.filter((inv) => {
    const name = `${inv.saleOrder.customer.firstName} ${inv.saleOrder.customer.lastName}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || inv.id.startsWith(search.toLowerCase());
    const matchStatus = !statusFilter || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const selectCls =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 bg-white';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Facturación</h1>
        <p className="mt-1 text-sm text-slate-500">
          Las facturas se generan automáticamente al confirmar un pedido de venta.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            placeholder="Buscar por cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={selectCls}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | InvoiceStatus)}
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Borrador</option>
          <option value="ISSUED">Emitida</option>
          <option value="PAID">Pagada</option>
          <option value="CANCELLED">Cancelada</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-slate-400">Cargando facturas...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-slate-400">
            {invoices.length === 0
              ? 'Aún no hay facturas. Se generan al confirmar un pedido de venta.'
              : 'No se encontraron facturas con los filtros aplicados.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">N° Factura</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((invoice) => (
                <tr
                  key={invoice.id}
                  onClick={() => setSelectedInvoice(invoice)}
                  className="cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    #{invoice.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {invoice.saleOrder.customer.firstName} {invoice.saleOrder.customer.lastName}
                    </div>
                    {invoice.saleOrder.customer.email && (
                      <div className="text-xs text-slate-400">{invoice.saleOrder.customer.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDate(invoice.issuedAt ?? invoice.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-slate-800">
                    {formatPrice(Number(invoice.total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedInvoice && (
        <InvoiceDetailPanel
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}
