'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { billingApi, type CreditNote, type InvoiceStatus } from '../../../../lib/api/billing';

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
  PENDING:   { label: 'Borrador',  className: 'bg-warn-subtle text-warn' },
  ISSUED:    { label: 'Emitida',   className: 'bg-info/10 text-info' },
  PAID:      { label: 'Pagada',    className: 'bg-accent-subtle text-accent-on' },
  CANCELLED: { label: 'Cancelada', className: 'bg-danger-subtle text-danger' },
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, className } = STATUS_MAP[status];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// ── Credit notes tab ───────────────────────────────────────────────────────────

function CreditNotesTab() {
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['credit-notes'],
    queryFn: billingApi.listCreditNotes,
  });

  if (isLoading) return <div className="py-16 text-center text-sm text-faint">Cargando...</div>;

  if (notes.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-faint">No hay notas de crédito emitidas.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <tr>
            <th className="px-4 py-3 text-left">N° Nota</th>
            <th className="px-4 py-3 text-left">Cliente</th>
            <th className="px-4 py-3 text-left">Motivo</th>
            <th className="px-4 py-3 text-left">Fecha</th>
            <th className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {notes.map((note: CreditNote) => (
            <tr key={note.id} className="hover:bg-surface-2">
              <td className="px-4 py-3 font-mono text-xs text-muted">
                {note.number ?? `NC-${note.id.slice(0, 6).toUpperCase()}`}
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-ink">
                  {note.invoice.saleOrder.customer.firstName}{' '}
                  {note.invoice.saleOrder.customer.lastName}
                </div>
                {note.invoice.saleOrder.customer.email && (
                  <div className="text-xs text-faint">
                    {note.invoice.saleOrder.customer.email}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-muted max-w-xs truncate">{note.reason}</td>
              <td className="px-4 py-3 text-muted">{formatDate(note.issuedAt)}</td>
              <td className="px-4 py-3 text-right font-mono font-medium text-ink">
                {formatPrice(Number(note.total))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type Tab = 'invoices' | 'credit-notes';

export default function BillingPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('invoices');
  const [statusFilter, setStatusFilter] = useState<'' | InvoiceStatus>('');
  const [search, setSearch] = useState('');

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: billingApi.listInvoices,
  });

  const filtered = invoices.filter((inv) => {
    const name =
      `${inv.saleOrder.customer.firstName} ${inv.saleOrder.customer.lastName}`.toLowerCase();
    const matchSearch =
      !search || name.includes(search.toLowerCase()) || inv.id.startsWith(search.toLowerCase());
    const matchStatus = !statusFilter || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pendingCount = invoices.filter((inv) => inv.status === 'PENDING').length;

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-ink text-ink'
        : 'border-transparent text-muted hover:text-ink'
    }`;

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Facturación</h1>
          <p className="mt-1 text-sm text-muted">
            Al confirmar un pedido se genera un borrador. El cajero lo revisa y lo emite.
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="mt-1 inline-flex items-center rounded-full bg-warn-subtle px-3 py-1 text-sm font-medium text-warn">
            {pendingCount} borrador{pendingCount > 1 ? 'es' : ''} pendiente{pendingCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-5 border-b border-border flex gap-1">
        <button className={tabCls('invoices')} onClick={() => setTab('invoices')}>
          Facturas
        </button>
        <button className={tabCls('credit-notes')} onClick={() => setTab('credit-notes')}>
          Notas de crédito
        </button>
      </div>

      {tab === 'credit-notes' ? (
        <CreditNotesTab />
      ) : (
        <>
          {/* Filters */}
          <div className="mb-4 flex items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <input
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong"
                placeholder="Buscar por cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong"
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
            <div className="py-16 text-center text-sm text-faint">Cargando facturas...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-faint">
                {invoices.length === 0
                  ? 'Aún no hay facturas. Se generan al confirmar un pedido de venta.'
                  : 'No se encontraron facturas con los filtros aplicados.'}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3 text-left">N° Factura</th>
                    <th className="px-4 py-3 text-left">Cliente</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Tipo</th>
                    <th className="px-4 py-3 text-left">Fecha</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((invoice) => (
                    <tr
                      key={invoice.id}
                      onClick={() => router.push(`/dashboard/billing/invoices/${invoice.id}`)}
                      className="cursor-pointer hover:bg-surface-2 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted">
                        {invoice.invoiceNumber
                          ? `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber}`
                          : `#${invoice.id.slice(0, 8).toUpperCase()}`}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">
                          {invoice.saleOrder.customer.firstName}{' '}
                          {invoice.saleOrder.customer.lastName}
                        </div>
                        {invoice.saleOrder.customer.email && (
                          <div className="text-xs text-faint">
                            {invoice.saleOrder.customer.email}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-muted text-xs">
                        {invoice.saleOrder.saleType === 'CREDIT'
                          ? `Crédito${invoice.saleOrder.installments ? ` · ${invoice.saleOrder.installments}c` : ''}`
                          : 'Contado'}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {formatDate(invoice.issuedAt ?? invoice.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-ink">
                        {formatPrice(Number(invoice.total))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
