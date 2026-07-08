'use client';

import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Printer, FileX } from 'lucide-react';
import { billingApi, type CreditNote, type Invoice, type InvoiceStatus } from '../../../../lib/api/billing';

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
  PENDING:   { label: 'Borrador',  className: 'bg-surface-2 text-muted' },
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

// ── Print invoice ──────────────────────────────────────────────────────────────

function printInvoice(invoice: Invoice) {
  const customer = invoice.saleOrder.customer;
  const customerName = `${customer.firstName} ${customer.lastName}`;
  const doc = customer.documentNumber
    ? `${customer.documentType ?? 'CI'}: ${customer.documentNumber}`
    : '';
  const invoiceRef = invoice.invoiceNumber
    ? `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber}`
    : `#${invoice.id.slice(0, 8).toUpperCase()}`;

  const itemRows = invoice.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${item.description}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${item.quantity}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${formatPrice(Number(item.unitPrice))}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${formatPrice(Number(item.total))}</td>
        </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Factura ${invoiceRef}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1e293b; padding: 32px; }
    h1 { font-size: 22px; font-weight: 700; }
    .header { display: flex; justify-content: space-between; margin-bottom: 28px; }
    .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    thead th { background: #f8fafc; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #e2e8f0; }
    .total-row td { padding: 10px 8px; font-weight: 700; font-size: 15px; border-top: 2px solid #1e293b; }
    .footer { margin-top: 48px; display: flex; justify-content: space-around; }
    .sig { border-top: 1px solid #94a3b8; width: 180px; text-align: center; padding-top: 6px; font-size: 11px; color: #64748b; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>FACTURA</h1>
      <div class="label" style="margin-top:4px">${invoiceRef}</div>
    </div>
    <div style="text-align:right">
      <div class="label">Fecha de emisión</div>
      <div>${formatDate(invoice.issuedAt ?? invoice.createdAt)}</div>
      ${invoice.dueDate ? `<div class="label" style="margin-top:8px">Vencimiento</div><div>${formatDate(invoice.dueDate)}</div>` : ''}
    </div>
  </div>

  <div style="display:flex;gap:40px;margin-bottom:20px">
    <div>
      <div class="label">Cliente</div>
      <div style="font-weight:600;margin-top:2px">${customerName}</div>
      ${customer.email ? `<div style="color:#64748b">${customer.email}</div>` : ''}
      ${doc ? `<div style="color:#64748b">${doc}</div>` : ''}
    </div>
    <div>
      <div class="label">Tipo de venta</div>
      <div style="margin-top:2px">${invoice.saleOrder.saleType === 'CREDIT' ? `Crédito${invoice.saleOrder.installments ? ` — ${invoice.saleOrder.installments} cuotas` : ''}` : 'Contado'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left">Descripción</th>
        <th style="text-align:center">Cant.</th>
        <th style="text-align:right">Precio unit.</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="3" style="text-align:right">TOTAL</td>
        <td style="text-align:right">${formatPrice(Number(invoice.total))}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <div class="sig">Firma del cliente</div>
    <div class="sig">Firma y sello empresa</div>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

// ── Cancel modal ───────────────────────────────────────────────────────────────

function CancelModal({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mutation = useMutation({
    mutationFn: () => billingApi.cancelInvoice(invoice.id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
      onClose();
    },
  });

  const isIssued = invoice.status === 'ISSUED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-ink">Cancelar factura</h3>
            {isIssued && (
              <p className="text-xs text-muted mt-1">
                Al cancelar una factura emitida se generará automáticamente una nota de crédito.
              </p>
            )}
          </div>
          <button onClick={onClose} className="ml-3 rounded-md p-1 text-faint hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-muted mb-1">
            Motivo de cancelación <span className="text-red-500">*</span>
          </label>
          <textarea
            ref={textareaRef}
            rows={3}
            className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong resize-none"
            placeholder="Ej: Error en los items, cliente solicitó cambios..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {mutation.isError && (
          <p className="mb-3 text-xs text-red-600">
            {(mutation.error as Error & { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'Error al cancelar'}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => mutation.mutate()}
            disabled={reason.trim().length < 5 || mutation.isPending}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
          >
            {mutation.isPending ? 'Cancelando...' : isIssued ? 'Cancelar y emitir nota de crédito' : 'Cancelar factura'}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted hover:bg-surface-2"
          >
            Volver
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Invoice detail panel ───────────────────────────────────────────────────────

function InvoiceDetailPanel({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) {
  const [showCancel, setShowCancel] = useState(false);
  const canCancel = invoice.status === 'PENDING' || invoice.status === 'ISSUED';
  const customer = invoice.saleOrder.customer;
  const invoiceRef = invoice.invoiceNumber
    ? `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber}`
    : `#${invoice.id.slice(0, 8).toUpperCase()}`;

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <aside className="relative z-50 flex h-full w-full max-w-sm flex-col bg-surface shadow-2xl overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-ink">
                  {customer.firstName} {customer.lastName}
                </p>
                <StatusBadge status={invoice.status} />
              </div>
              {customer.email && (
                <p className="text-xs text-faint mt-0.5">{customer.email}</p>
              )}
              <p className="text-xs text-faint mt-0.5 font-mono">{invoiceRef}</p>
            </div>
            <button
              onClick={onClose}
              className="ml-3 shrink-0 rounded-md p-1 text-faint hover:bg-surface-2"
            >
              <X size={18} />
            </button>
          </div>

          {/* Dates */}
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-2">Fechas</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Creada</span>
                <span className="text-muted">{formatDate(invoice.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Emitida</span>
                <span className="text-muted">{formatDate(invoice.issuedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Vencimiento</span>
                <span className="text-muted">{formatDate(invoice.dueDate)}</span>
              </div>
            </div>
          </div>

          {/* Sale type */}
          <div className="border-b border-border px-5 py-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Tipo de venta</span>
              <span className="font-medium text-ink">
                {invoice.saleOrder.saleType === 'CREDIT'
                  ? `Crédito${invoice.saleOrder.installments ? ` · ${invoice.saleOrder.installments} cuotas` : ''}`
                  : 'Contado'}
              </span>
            </div>
          </div>

          {/* Items */}
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">Detalle</p>
            <div className="space-y-2">
              {invoice.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink truncate">{item.description}</p>
                    <p className="text-xs text-faint">
                      {item.quantity} × {formatPrice(Number(item.unitPrice))}
                      {item.ivaRate ? ` · IVA ${item.ivaRate}%` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-ink shrink-0">
                    {formatPrice(Number(item.total))}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center border-t border-border mt-3 pt-3">
              <span className="text-sm font-semibold text-muted">Total</span>
              <span className="text-base font-bold text-ink">
                {formatPrice(Number(invoice.total))}
              </span>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="border-b border-border px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-1">Notas</p>
              <p className="text-sm text-muted">{invoice.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="px-5 py-4 space-y-2 mt-auto">
            <button
              onClick={() => printInvoice(invoice)}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted hover:bg-surface-2"
            >
              <Printer size={15} />
              Imprimir / descargar PDF
            </button>
            {canCancel && (
              <button
                onClick={() => setShowCancel(true)}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <FileX size={15} />
                Cancelar factura
              </button>
            )}
          </div>
        </aside>
      </div>

      {showCancel && (
        <CancelModal invoice={invoice} onClose={() => { setShowCancel(false); onClose(); }} />
      )}
    </>
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
          {notes.map((note) => (
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
  const [tab, setTab] = useState<Tab>('invoices');
  const [statusFilter, setStatusFilter] = useState<'' | InvoiceStatus>('');
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

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

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-ink text-ink'
        : 'border-transparent text-muted hover:text-ink'
    }`;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-ink">Facturación</h1>
        <p className="mt-1 text-sm text-muted">
          Las facturas se generan automáticamente al confirmar un pedido de venta.
        </p>
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
                      onClick={() => setSelectedInvoice(invoice)}
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

      {selectedInvoice && (
        <InvoiceDetailPanel
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}
