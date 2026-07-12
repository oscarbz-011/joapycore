'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, Send, AlertTriangle } from 'lucide-react';
import { billingApi, type Invoice, type InvoiceStatus, type IssueInvoicePayload } from '../../../../../../lib/api/billing';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_MAP: Record<InvoiceStatus, { label: string; className: string }> = {
  PENDING:   { label: 'Borrador',  className: 'bg-warn-subtle text-warn' },
  ISSUED:    { label: 'Emitida',   className: 'bg-info/10 text-info' },
  PAID:      { label: 'Pagada',    className: 'bg-accent-subtle text-accent-on' },
  CANCELLED: { label: 'Cancelada', className: 'bg-danger-subtle text-danger' },
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, className } = STATUS_MAP[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// ── Print ──────────────────────────────────────────────────────────────────────

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

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Factura ${invoiceRef}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px;color:#1e293b;padding:32px}
  h1{font-size:22px;font-weight:700}.header{display:flex;justify-content:space-between;margin-bottom:28px}
  .label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
  table{width:100%;border-collapse:collapse;margin-top:20px}
  thead th{background:#f8fafc;padding:8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e2e8f0}
  .total-row td{padding:10px 8px;font-weight:700;font-size:15px;border-top:2px solid #1e293b}
  .footer{margin-top:48px;display:flex;justify-content:space-around}
  .sig{border-top:1px solid #94a3b8;width:180px;text-align:center;padding-top:6px;font-size:11px;color:#64748b}
  @media print{body{padding:20px}}</style></head><body>
  <div class="header"><div><h1>FACTURA</h1><div class="label" style="margin-top:4px">${invoiceRef}</div></div>
  <div style="text-align:right"><div class="label">Fecha de emisión</div>
  <div>${formatDate(invoice.issuedAt ?? invoice.createdAt)}</div>
  ${invoice.dueDate ? `<div class="label" style="margin-top:8px">Vencimiento</div><div>${formatDate(invoice.dueDate)}</div>` : ''}
  </div></div>
  <div style="display:flex;gap:40px;margin-bottom:20px">
  <div><div class="label">Cliente</div><div style="font-weight:600;margin-top:2px">${customerName}</div>
  ${customer.email ? `<div style="color:#64748b">${customer.email}</div>` : ''}
  ${doc ? `<div style="color:#64748b">${doc}</div>` : ''}</div>
  <div><div class="label">Tipo de venta</div>
  <div style="margin-top:2px">${invoice.saleOrder.saleType === 'CREDIT' ? `Crédito${invoice.saleOrder.installments ? ` — ${invoice.saleOrder.installments} cuotas` : ''}` : 'Contado'}</div>
  </div></div>
  <table><thead><tr><th style="text-align:left">Descripción</th><th style="text-align:center">Cant.</th>
  <th style="text-align:right">Precio unit.</th><th style="text-align:right">Total</th></tr></thead>
  <tbody>${itemRows}</tbody>
  <tfoot><tr class="total-row"><td colspan="3" style="text-align:right">TOTAL</td>
  <td style="text-align:right">${formatPrice(Number(invoice.total))}</td></tr></tfoot></table>
  <div class="footer"><div class="sig">Firma del cliente</div><div class="sig">Firma y sello empresa</div></div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

// ── Row helper ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium text-ink text-right">{value}</span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => billingApi.getInvoice(id),
  });

  // Issue form state — initialized from invoice once loaded
  const [form, setForm] = useState<IssueInvoicePayload>({
    paymentCondition: 'CASH',
    dueDate: '',
    invoiceNumber: '',
    invoicePrefix: '',
    notes: '',
  });
  const [formReady, setFormReady] = useState(false);

  useEffect(() => {
    if (!invoice || formReady) return;
    setForm({
      paymentCondition: invoice.saleOrder.saleType === 'CREDIT' ? 'CREDIT' : 'CASH',
      dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : '',
      invoiceNumber: invoice.invoiceNumber ?? '',
      invoicePrefix: invoice.invoicePrefix ?? '',
      notes: invoice.notes ?? '',
    });
    setFormReady(true);
  }, [invoice, formReady]);

  // Cancel state
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Mutations
  const issueMutation = useMutation({
    mutationFn: () =>
      billingApi.issueInvoice(id, {
        paymentCondition: form.paymentCondition,
        dueDate: form.dueDate || undefined,
        invoiceNumber: form.invoiceNumber || undefined,
        invoicePrefix: form.invoicePrefix || undefined,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => billingApi.cancelInvoice(id, cancelReason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
      setShowCancelForm(false);
    },
  });

  // ── Loading / error ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="py-24 text-center text-sm text-faint">Cargando factura...</div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-faint">No se encontró la factura.</p>
        <button
          onClick={() => router.back()}
          className="mt-3 text-sm font-medium text-ink underline underline-offset-2"
        >
          Volver
        </button>
      </div>
    );
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const isPending = invoice.status === 'PENDING';
  const canCancel = invoice.status === 'PENDING' || invoice.status === 'ISSUED';
  const customer = invoice.saleOrder.customer;
  const invoiceRef = invoice.invoiceNumber
    ? `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber}`
    : `#${invoice.id.slice(0, 8).toUpperCase()}`;
  const isCredit = form.paymentCondition === 'CREDIT';
  const canIssue = !isCredit || !!form.dueDate;

  const inp = 'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong';
  const lbl = 'block text-xs font-medium text-muted mb-1';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl">
      {/* Back */}
      <button
        onClick={() => router.push('/dashboard/billing')}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
      >
        <ArrowLeft size={15} />
        Facturas
      </button>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">
              {customer.firstName} {customer.lastName}
            </h1>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {customer.email && <span>{customer.email} · </span>}
            <span className="font-mono">{invoiceRef}</span>
          </p>
        </div>
        <button
          onClick={() => printInvoice(invoice)}
          className="shrink-0 flex items-center gap-2 rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted hover:bg-surface-2"
        >
          <Printer size={15} />
          Imprimir
        </button>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">

        {/* ── LEFT: Customer + Items + Timeline ── */}
        <div className="space-y-5">

          {/* Customer */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">
              Cliente
            </h2>
            <InfoRow label="Nombre" value={`${customer.firstName} ${customer.lastName}`} />
            {customer.email && <InfoRow label="Email" value={customer.email} />}
            {customer.documentNumber && (
              <InfoRow
                label="Documento"
                value={`${customer.documentType ?? 'C.I.'} ${customer.documentNumber}`}
              />
            )}
          </section>

          {/* Items */}
          <section className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
                Detalle
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-wider text-faint">
                <tr>
                  <th className="px-5 py-3 text-left">Descripción</th>
                  <th className="px-5 py-3 text-center w-16">Cant.</th>
                  <th className="px-5 py-3 text-right">P. Unit.</th>
                  <th className="px-5 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoice.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{item.description}</p>
                      {item.ivaRate ? (
                        <p className="text-xs text-faint">IVA {item.ivaRate}%</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-center text-muted tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="px-5 py-3 text-right text-muted tabular-nums">
                      {formatPrice(Number(item.unitPrice))}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-ink tabular-nums">
                      {formatPrice(Number(item.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center px-5 py-4 border-t border-border bg-surface-2">
              <span className="text-sm font-semibold text-muted">Total</span>
              <span className="text-lg font-bold text-ink tabular-nums">
                {formatPrice(Number(invoice.total))}
              </span>
            </div>
          </section>

          {/* Timeline */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">
              Historial
            </h2>
            <InfoRow label="Creada" value={formatDate(invoice.createdAt)} />
            <InfoRow label="Emitida" value={formatDate(invoice.issuedAt)} />
            <InfoRow label="Vencimiento" value={formatDate(invoice.dueDate)} />
          </section>
        </div>

        {/* ── RIGHT: Emission form / info + Actions ── */}
        <div className="space-y-5">

          {isPending ? (
            /* ── PENDING: editable emission form ── */
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-faint mb-4">
                Emisión
              </h2>

              {/* Payment condition */}
              <div className="mb-4">
                <label className={lbl}>Condición de venta *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['CASH', 'CREDIT'] as const).map((c) => (
                    <label
                      key={c}
                      className={`flex items-center justify-center rounded-lg border px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
                        form.paymentCondition === c
                          ? 'border-accent bg-accent-subtle text-accent-on'
                          : 'border-border-strong text-muted hover:bg-surface-2'
                      }`}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        checked={form.paymentCondition === c}
                        onChange={() => setForm((f) => ({ ...f, paymentCondition: c }))}
                      />
                      {c === 'CASH' ? 'Contado' : 'Crédito'}
                    </label>
                  ))}
                </div>
              </div>

              {/* Due date — only for credit */}
              {isCredit && (
                <div className="mb-4">
                  <label className={lbl}>Fecha de vencimiento *</label>
                  <input
                    type="date"
                    className={inp}
                    value={form.dueDate ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    required
                  />
                </div>
              )}

              {/* Numbering */}
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Timbrado / Prefijo</label>
                  <input
                    className={inp}
                    placeholder="001"
                    value={form.invoicePrefix ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, invoicePrefix: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={lbl}>N° de factura</label>
                  <input
                    className={inp}
                    placeholder="000001"
                    value={form.invoiceNumber ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="mb-5">
                <label className={lbl}>Notas</label>
                <textarea
                  rows={3}
                  className={`${inp} resize-none`}
                  placeholder="Observaciones para la factura..."
                  value={form.notes ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {issueMutation.isError && (
                <p className="mb-3 text-xs text-danger">
                  {(issueMutation.error as Error & { response?: { data?: { message?: string } } })
                    ?.response?.data?.message ?? 'Error al emitir la factura'}
                </p>
              )}

              <button
                onClick={() => issueMutation.mutate()}
                disabled={!canIssue || issueMutation.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                <Send size={15} />
                {issueMutation.isPending ? 'Emitiendo...' : 'Emitir factura'}
              </button>
            </section>

          ) : (
            /* ── ISSUED / PAID / CANCELLED: read-only info ── */
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">
                Detalles de emisión
              </h2>
              <InfoRow
                label="Condición"
                value={
                  invoice.saleOrder.saleType === 'CREDIT'
                    ? `Crédito${invoice.saleOrder.installments ? ` · ${invoice.saleOrder.installments} cuotas` : ''}`
                    : 'Contado'
                }
              />
              {(invoice.invoiceNumber || invoice.invoicePrefix) && (
                <InfoRow
                  label="N° Factura"
                  value={`${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber ?? ''}`}
                />
              )}
              {invoice.notes && <InfoRow label="Notas" value={invoice.notes} />}

              {invoice.status === 'ISSUED' && (
                <div className="mt-4">
                  <button
                    onClick={() => printInvoice(invoice)}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-muted hover:bg-surface-2"
                  >
                    <Printer size={15} />
                    Imprimir / descargar PDF
                  </button>
                </div>
              )}
            </section>
          )}

          {/* ── Cancel zone ── */}
          {canCancel && (
            <section className="rounded-xl border border-danger/20 bg-danger-subtle p-5">
              {!showCancelForm ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-danger">
                      Cancelar factura
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {invoice.status === 'ISSUED'
                        ? 'Se generará una nota de crédito.'
                        : 'Se descartará el borrador.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCancelForm(true)}
                    className="text-sm font-medium text-danger underline underline-offset-2 hover:opacity-80"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
                    <p className="text-xs text-danger">
                      {invoice.status === 'ISSUED'
                        ? 'Al cancelar una factura emitida se generará automáticamente una nota de crédito.'
                        : 'Esta acción descartará el borrador. No se generará nota de crédito.'}
                    </p>
                  </div>
                  <label className="block text-xs font-medium text-danger mb-1">
                    Motivo <span>*</span>
                  </label>
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border border-danger/30 bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-danger/40 resize-none mb-3"
                    placeholder="Ej: Error en los items, cliente solicitó cambios..."
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                  {cancelMutation.isError && (
                    <p className="mb-2 text-xs text-danger">
                      {(cancelMutation.error as Error & { response?: { data?: { message?: string } } })
                        ?.response?.data?.message ?? 'Error al cancelar'}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelReason.trim().length < 5 || cancelMutation.isPending}
                      className="flex-1 rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                    >
                      {cancelMutation.isPending
                        ? 'Cancelando...'
                        : invoice.status === 'ISSUED'
                          ? 'Cancelar y emitir nota de crédito'
                          : 'Confirmar cancelación'}
                    </button>
                    <button
                      onClick={() => { setShowCancelForm(false); setCancelReason(''); }}
                      className="rounded-lg border border-border-strong px-3 py-2 text-sm text-muted hover:bg-surface-2"
                    >
                      Volver
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
