'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NumericInput } from '../../../../components/numeric-input';
import { X, Printer, FileText, CreditCard, ChevronRight } from 'lucide-react';
import {
  paymentsApi,
  PAYMENT_METHOD_LABELS,
  type AccountsReceivable,
  type ARStatus,
  type PaymentMethod,
  type RegisterPaymentPayload,
  type CollectionsSummary,
} from '../../../../lib/api/payments';
import {
  financeApi,
  type Loan,
  type Installment,
  type InstallmentStatus,
} from '../../../../lib/api/finance';
import { billingApi, type Invoice } from '../../../../lib/api/billing';

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

function invoiceRef(ar: AccountsReceivable['invoice']) {
  if (ar.invoiceNumber) return `${ar.invoicePrefix ?? ''}${ar.invoiceNumber}`;
  return `#${ar.id.slice(0, 8).toUpperCase()}`;
}

// ── Status badges ──────────────────────────────────────────────────────────────

const AR_STATUS_MAP: Record<ARStatus, { label: string; className: string }> = {
  PENDING:   { label: 'Pendiente', className: 'bg-amber-50 text-amber-700' },
  PARTIAL:   { label: 'Parcial',   className: 'bg-blue-50 text-blue-700' },
  PAID:      { label: 'Pagado',    className: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'Cancelado', className: 'bg-surface-2 text-muted' },
};

function ARStatusBadge({ status }: { status: ARStatus }) {
  const { label, className } = AR_STATUS_MAP[status];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

const INV_STATUS_MAP = {
  PENDING:   { label: 'Borrador',  className: 'bg-surface-2 text-muted' },
  ISSUED:    { label: 'Emitida',   className: 'bg-blue-50 text-blue-700' },
  PAID:      { label: 'Pagada',    className: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'Cancelada', className: 'bg-red-50 text-red-600' },
} as const;

function InvStatusBadge({ status }: { status: keyof typeof INV_STATUS_MAP }) {
  const { label, className } = INV_STATUS_MAP[status];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

const INST_STATUS_MAP: Record<InstallmentStatus, { label: string; className: string }> = {
  PENDING:  { label: 'Pendiente', className: 'bg-amber-50 text-amber-700' },
  PARTIAL:  { label: 'Parcial',   className: 'bg-blue-50 text-blue-700' },
  PAID:     { label: 'Pagada',    className: 'bg-emerald-50 text-emerald-700' },
  OVERDUE:  { label: 'Vencida',   className: 'bg-red-50 text-red-600' },
};

function InstallmentStatusBadge({ status }: { status: InstallmentStatus }) {
  const { label, className } = INST_STATUS_MAP[status];
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
  const ref = invoice.invoiceNumber
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
  <title>Factura ${ref}</title>
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
      <div class="label" style="margin-top:4px">${ref}</div>
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
  w.print();
}

// ── Invoice detail modal ───────────────────────────────────────────────────────

function InvoiceDetailModal({
  invoiceId,
  onClose,
}: {
  invoiceId: string;
  onClose: () => void;
}) {
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => billingApi.getInvoice(invoiceId),
  });

  const customer = invoice?.saleOrder.customer;
  const ref = invoice
    ? invoice.invoiceNumber
      ? `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber}`
      : `#${invoice.id.slice(0, 8).toUpperCase()}`
    : '…';

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-surface shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-faint" />
            <div>
              <h2 className="text-base font-semibold text-ink">
                Factura {ref}
              </h2>
              {invoice && (
                <p className="text-xs text-faint mt-0.5">
                  Emitida: {formatDate(invoice.issuedAt ?? invoice.createdAt)}
                </p>
              )}
            </div>
            {invoice && <InvStatusBadge status={invoice.status} />}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-faint hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">
          {isLoading && (
            <p className="py-10 text-center text-sm text-faint">Cargando factura…</p>
          )}

          {invoice && (
            <>
              {/* Customer info */}
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-surface-2 px-4 py-3 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-faint mb-1">Cliente</p>
                  <p className="font-semibold text-ink">
                    {customer?.firstName} {customer?.lastName}
                  </p>
                  {customer?.email && (
                    <p className="text-muted text-xs">{customer.email}</p>
                  )}
                  {customer?.documentNumber && (
                    <p className="text-muted text-xs">
                      {customer.documentType ?? 'CI'}: {customer.documentNumber}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-faint mb-1">Tipo de venta</p>
                  <p className="text-ink">
                    {invoice.saleOrder.saleType === 'CREDIT'
                      ? `Crédito${invoice.saleOrder.installments ? ` · ${invoice.saleOrder.installments} cuotas` : ''}`
                      : 'Contado'}
                  </p>
                  {invoice.dueDate && (
                    <p className="text-muted text-xs mt-1">
                      Venc.: {formatDate(invoice.dueDate)}
                    </p>
                  )}
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-2">
                  Detalle de productos
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Descripción</th>
                        <th className="px-4 py-2.5 text-center">Cant.</th>
                        <th className="px-4 py-2.5 text-right">Precio unit.</th>
                        <th className="px-4 py-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoice.items.map((item) => (
                        <tr key={item.id} className="hover:bg-surface-2">
                          <td className="px-4 py-2.5 text-muted">{item.description}</td>
                          <td className="px-4 py-2.5 text-center text-muted">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-muted">
                            {formatPrice(Number(item.unitPrice))}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium text-ink">
                            {formatPrice(Number(item.total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-ink">
                        <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-muted">
                          TOTAL
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-base font-bold text-ink">
                          {formatPrice(Number(invoice.total))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {invoice.notes && (
                <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
                  <span className="font-medium text-muted">Notas: </span>
                  {invoice.notes}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {invoice && (
          <div className="border-t border-border px-6 py-4 flex justify-between items-center shrink-0">
            <button
              onClick={onClose}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm text-muted hover:bg-surface-2"
            >
              Cerrar
            </button>
            <button
              onClick={() => printInvoice(invoice)}
              className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80"
            >
              <Printer size={15} />
              Imprimir factura
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Register payment modal (cash sales only) ───────────────────────────────────

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

  const [amount, setAmount] = useState<number>(Math.round(remaining));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const dto: RegisterPaymentPayload = {
        amount,
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
    'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong';
  const labelCls = 'block text-xs font-medium text-muted mb-1';

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Registrar pago</h2>
            <p className="text-xs text-faint mt-0.5">
              {ar.invoice.saleOrder.customer.firstName} {ar.invoice.saleOrder.customer.lastName}
              {' · '}Saldo: {formatPrice(remaining)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-faint hover:bg-surface-2">
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
              <NumericInput
                value={amount}
                onChange={setAmount}
                className={inputCls}
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

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm text-muted hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50"
            >
              {mutation.isPending ? 'Registrando...' : 'Confirmar pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Pay installment modal (credit sales) ───────────────────────────────────────

function PayInstallmentModal({
  installment,
  saleOrderId,
  onClose,
  onSaved,
}: {
  installment: Installment;
  saleOrderId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const remaining = Number(installment.amount) - Number(installment.paidAmount);

  const [amount, setAmount] = useState<number>(Math.ceil(remaining));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      financeApi.payInstallment(installment.id, {
        amount,
        paymentMethod: method,
        paymentReference: reference.trim() || undefined,
        paymentDate: date,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts-receivable'] });
      void queryClient.invalidateQueries({ queryKey: ['loan-by-order', saleOrderId] });
      onSaved();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al registrar el pago'));
    },
  });

  const inputCls =
    'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong';
  const labelCls = 'block text-xs font-medium text-muted mb-1';

  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">
              Pagar cuota #{installment.number}
            </h2>
            <p className="text-xs text-faint mt-0.5">
              Vence: {formatDate(installment.dueDate)} · Saldo: {formatPrice(remaining)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-faint hover:bg-surface-2">
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
              <NumericInput
                value={amount}
                onChange={setAmount}
                className={inputCls}
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
              placeholder="N° recibo, transferencia..."
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

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm text-muted hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50"
            >
              {mutation.isPending ? 'Registrando...' : 'Confirmar pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Credit AR detail (loan summary + installment list) ─────────────────────────

function CreditARDetail({
  saleOrderId,
  onInstallmentPaid,
}: {
  saleOrderId: string;
  onInstallmentPaid: () => void;
}) {
  const [payingInstallment, setPayingInstallment] = useState<Installment | null>(null);

  const { data: loan, isLoading, error } = useQuery<Loan>({
    queryKey: ['loan-by-order', saleOrderId],
    queryFn: () => financeApi.getLoanByOrder(saleOrderId),
    retry: false,
  });

  if (isLoading) {
    return <p className="py-4 text-center text-sm text-faint">Cargando cuotas...</p>;
  }

  if (!loan) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    const msg =
      status === 403
        ? 'El módulo de finanzas no está habilitado para este tenant.'
        : status === 404
          ? 'El préstamo aún no fue generado para esta venta. Verificá que el crédito fue aprobado correctamente.'
          : 'No se pudo cargar el plan de cuotas.';
    return (
      <p className="py-4 text-center text-sm text-faint">{msg}</p>
    );
  }

  const installmentAmount   = Number(loan.installments[0]?.amount ?? 0);
  const paidFromInstallments = loan.installments.reduce((s, i) => s + Number(i.paidAmount), 0);
  const totalCredit          = Number(loan.totalAmount);
  const creditPct            = totalCredit > 0 ? (paidFromInstallments / totalCredit) * 100 : 0;

  return (
    <>
      {/* Loan summary */}
      <div className="rounded-xl bg-surface-2 border border-border px-4 py-3 text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-muted">Capital financiado</span>
          <span className="font-medium text-ink">{formatPrice(Number(loan.principal))}</span>
        </div>
        {Number(loan.interestRate) > 0 && (
          <div className="flex justify-between">
            <span className="text-muted">Tasa de interés</span>
            <span className="text-ink">{Number(loan.interestRate)}%</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2">
          <span className="font-semibold text-muted">Total a crédito</span>
          <span className="font-bold text-ink">{formatPrice(totalCredit)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Cobrado</span>
          <span className="font-medium text-emerald-600">{formatPrice(paidFromInstallments)}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-surface">
          <div
            className="h-2 rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(creditPct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-faint">
          {loan.totalInstallments} cuotas de {formatPrice(installmentAmount)} c/u
        </p>
      </div>

      {/* Installment list */}
      <div className="space-y-1.5">
        {loan.installments.map((inst) => {
          const remaining = Number(inst.amount) - Number(inst.paidAmount);
          const isPayable =
            (inst.status === 'PENDING' || inst.status === 'PARTIAL' || inst.status === 'OVERDUE') &&
            remaining > 0;
          return (
            <div
              key={inst.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 w-5 text-xs font-mono text-faint">#{inst.number}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <InstallmentStatusBadge status={inst.status} />
                    <span className="text-xs text-faint">{formatDate(inst.dueDate)}</span>
                  </div>
                  <p className="font-medium text-ink mt-0.5">
                    {formatPrice(Number(inst.amount))}
                    {Number(inst.paidAmount) > 0 && inst.status !== 'PAID' && (
                      <span className="ml-1 text-xs font-normal text-emerald-600">
                        · pagado: {formatPrice(Number(inst.paidAmount))}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {isPayable && (
                <button
                  onClick={() => setPayingInstallment(inst)}
                  className="ml-2 shrink-0 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-canvas hover:opacity-80"
                >
                  Pagar
                </button>
              )}
            </div>
          );
        })}
      </div>

      <a
        href="/dashboard/finance"
        className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted hover:bg-surface-2 hover:border-border-strong transition-colors"
      >
        Ver en módulo de Finanzas
        <ChevronRight size={13} />
      </a>

      {payingInstallment && (
        <PayInstallmentModal
          installment={payingInstallment}
          saleOrderId={saleOrderId}
          onClose={() => setPayingInstallment(null)}
          onSaved={() => {
            setPayingInstallment(null);
            onInstallmentPaid();
          }}
        />
      )}
    </>
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
  const [showInvoice, setShowInvoice] = useState(false);
  const queryClient = useQueryClient();

  const isCredit = ar.invoice.saleOrder.saleType === 'CREDIT';
  const remaining = Number(ar.amount) - Number(ar.paidAmount);
  const pct = Number(ar.amount) > 0 ? (Number(ar.paidAmount) / Number(ar.amount)) * 100 : 0;
  const ref = invoiceRef(ar.invoice);

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <aside className="relative z-50 flex h-full w-full max-w-sm flex-col bg-surface shadow-2xl overflow-y-auto">

          {/* Header */}
          <div className="flex items-start justify-between border-b border-border px-5 py-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-ink">
                  {ar.invoice.saleOrder.customer.firstName} {ar.invoice.saleOrder.customer.lastName}
                </p>
                <ARStatusBadge status={ar.status} />
                {isCredit && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                    <CreditCard size={11} />
                    Crédito
                  </span>
                )}
              </div>
              {ar.invoice.saleOrder.customer.email && (
                <p className="text-xs text-faint mt-0.5">{ar.invoice.saleOrder.customer.email}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="ml-3 shrink-0 rounded-md p-1 text-faint hover:bg-surface-2"
            >
              <X size={18} />
            </button>
          </div>

          {/* Invoice reference */}
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">Factura</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{ref}</p>
                <p className="text-xs text-faint mt-0.5">
                  {formatDate(ar.invoice.issuedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <InvStatusBadge status={ar.invoice.status} />
                <button
                  onClick={() => setShowInvoice(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:border-border-strong transition-colors"
                >
                  <FileText size={13} />
                  Ver detalle
                </button>
              </div>
            </div>
          </div>

          {/* Cash: saldo section */}
          {!isCredit && (
            <div className="border-b border-border px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">Saldo</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Total factura</span>
                  <span className="font-medium text-ink">{formatPrice(Number(ar.amount))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Pagado</span>
                  <span className="font-medium text-emerald-600">{formatPrice(Number(ar.paidAmount))}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-2">
                  <div
                    className="h-2 rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="font-semibold text-muted">Saldo pendiente</span>
                  <span className="font-bold text-ink">{formatPrice(remaining)}</span>
                </div>
              </div>
              {ar.dueDate && (
                <p className="text-xs text-faint mt-2">Vencimiento: {formatDate(ar.dueDate)}</p>
              )}
            </div>
          )}

          {/* Credit: loan + installments */}
          {isCredit && (
            <div className="border-b border-border px-5 py-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                Plan de cuotas
              </p>
              <CreditARDetail
                saleOrderId={ar.invoice.saleOrder.id}
                onInstallmentPaid={() => {
                  void queryClient.invalidateQueries({ queryKey: ['accounts-receivable'] });
                }}
              />
            </div>
          )}

          {/* Payment history (cash only — credit payments go through installments) */}
          {ar.paymentRecords.length > 0 && (
            <div className="border-b border-border px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">
                Historial de pagos
              </p>
              <div className="space-y-2">
                {ar.paymentRecords.map((pr) => (
                  <div key={pr.id} className="rounded-lg bg-surface-2 px-3 py-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-ink">
                        {formatPrice(Number(pr.amount))}
                      </span>
                      <span className="text-xs text-muted">{formatDate(pr.paymentDate)}</span>
                    </div>
                    <p className="text-xs text-faint mt-0.5">
                      {PAYMENT_METHOD_LABELS[pr.paymentMethod]}
                      {pr.reference ? ` · ${pr.reference}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action: only for cash sales */}
          {!isCredit && (ar.status === 'PENDING' || ar.status === 'PARTIAL') && (
            <div className="px-5 py-4">
              <button
                onClick={() => setShowRegister(true)}
                className="w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80"
              >
                Registrar pago
              </button>
            </div>
          )}
        </aside>
      </div>

      {showInvoice && (
        <InvoiceDetailModal
          invoiceId={ar.invoice.id}
          onClose={() => setShowInvoice(false)}
        />
      )}

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

// ── Collections widget ─────────────────────────────────────────────────────────

const METHOD_SHORT: Record<string, string> = {
  CASH:          'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  PAGO_EXPRESS:  'Pago Express',
  AQUI_PAGO:     'AquíPago',
  DEPOSITO:      'Depósito',
  CHEQUE:        'Cheque',
  UNKNOWN:       'Sin método',
};

const MES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function CollectionsWidget() {
  const now   = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data, isLoading } = useQuery<CollectionsSummary>({
    queryKey: ['collections', month],
    queryFn:  () => paymentsApi.getCollections(month),
  });

  const monthLabel = MES_LARGO[now.getMonth()] + ' ' + now.getFullYear();

  const totalPct = (data && data.total > 0)
    ? Math.round((data.cash.total / data.total) * 100)
    : 0;

  const methodEntries = data
    ? Object.entries(data.byMethod).sort(([, a], [, b]) => b - a)
    : [];

  return (
    <div className="rounded-xl border border-border bg-panel p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">Recaudaciones</p>
          <p className="text-sm text-muted">{monthLabel}</p>
        </div>
        {!isLoading && data && (
          <p className="text-xl font-bold text-ink">{formatPrice(data.total)}</p>
        )}
        {isLoading && <div className="h-5 w-32 animate-pulse rounded bg-border" />}
      </div>

      {/* Cash vs Credit */}
      {data && data.total > 0 && (
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-surface overflow-hidden flex gap-0.5">
            <div className="h-full rounded-l-full bg-emerald-500 transition-all" style={{ width: `${totalPct}%` }} />
            <div className="h-full rounded-r-full bg-violet-500 transition-all" style={{ width: `${100 - totalPct}%` }} />
          </div>
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-muted">Contado</span>
              <span className="font-semibold text-ink ml-1">{formatPrice(data.cash.total)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
              <span className="text-muted">Crédito</span>
              <span className="font-semibold text-ink ml-1">{formatPrice(data.credit.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* By payment method */}
      {methodEntries.length > 0 && (
        <div className="border-t border-border pt-3 space-y-1.5">
          <p className="text-xs font-medium text-faint uppercase tracking-wider mb-2">Por fuente</p>
          {methodEntries.map(([method, amount]) => {
            const pct = data!.total > 0 ? (amount / data!.total) * 100 : 0;
            return (
              <div key={method} className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">{METHOD_SHORT[method] ?? method}</span>
                  <span className="font-medium text-ink">{formatPrice(amount)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface">
                  <div
                    className="h-1.5 rounded-full bg-accent transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && data && data.total === 0 && (
        <p className="text-center text-xs text-faint py-2">Sin recaudaciones registradas este mes</p>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [statusFilter, setStatusFilter] = useState<'' | ARStatus>('');
  const [typeFilter, setTypeFilter] = useState<'' | 'CASH' | 'CREDIT'>('');
  const [selectedAR, setSelectedAR] = useState<AccountsReceivable | null>(null);

  const { data: arList = [], isLoading } = useQuery({
    queryKey: ['accounts-receivable'],
    queryFn: paymentsApi.listAR,
  });

  const filtered = arList.filter((ar) => {
    if (statusFilter && ar.status !== statusFilter) return false;
    if (typeFilter && ar.invoice.saleOrder.saleType !== typeFilter) return false;
    return true;
  });

  const selectCls =
    'rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong';

  const totalPending = arList
    .filter((ar) => ar.status === 'PENDING' || ar.status === 'PARTIAL')
    .reduce((sum, ar) => {
      const isCredit = ar.invoice.saleOrder.saleType === 'CREDIT';
      const paid = isCredit && ar.invoice.saleOrder.loan
        ? ar.invoice.saleOrder.loan.installments.reduce((s, i) => s + Number(i.paidAmount), 0)
        : Number(ar.paidAmount);
      const total = isCredit && ar.invoice.saleOrder.loan
        ? Number(ar.invoice.saleOrder.loan.totalAmount)
        : Number(ar.amount);
      return sum + (total - paid);
    }, 0);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Pagos</h1>
          <p className="mt-1 text-sm text-muted">Cuentas por cobrar y registro de pagos</p>
        </div>
        {totalPending > 0 && (
          <div className="rounded-xl bg-warn-subtle border border-warn px-4 py-2 text-right">
            <p className="text-xs text-warn font-medium">Total pendiente</p>
            <p className="text-lg font-bold text-warn">{formatPrice(totalPending)}</p>
          </div>
        )}
      </div>

      {/* Collections widget */}
      <div className="mb-6">
        <CollectionsWidget />
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-3">
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
        <select
          className={selectCls}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as '' | 'CASH' | 'CREDIT')}
        >
          <option value="">Contado y crédito</option>
          <option value="CASH">Solo contado</option>
          <option value="CREDIT">Solo crédito</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-faint">Cargando cuentas por cobrar...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-faint">
            {arList.length === 0
              ? 'Las cuentas por cobrar se generan automáticamente al emitir una factura.'
              : 'No se encontraron cuentas con los filtros aplicados.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Factura</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Vencimiento</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Pagado</th>
                <th className="px-4 py-3 text-right">Pendiente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((ar) => {
                const isCredit = ar.invoice.saleOrder.saleType === 'CREDIT';
                const effectivePaid = isCredit && ar.invoice.saleOrder.loan
                  ? ar.invoice.saleOrder.loan.installments.reduce((s, i) => s + Number(i.paidAmount), 0)
                  : Number(ar.paidAmount);
                const effectiveTotal = isCredit && ar.invoice.saleOrder.loan
                  ? Number(ar.invoice.saleOrder.loan.totalAmount)
                  : Number(ar.amount);
                const pending = effectiveTotal - effectivePaid;
                return (
                  <tr
                    key={ar.id}
                    onClick={() => setSelectedAR(ar)}
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">
                        {ar.invoice.saleOrder.customer.firstName}{' '}
                        {ar.invoice.saleOrder.customer.lastName}
                      </div>
                      {ar.invoice.saleOrder.customer.email && (
                        <div className="text-xs text-faint">
                          {ar.invoice.saleOrder.customer.email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted">
                        {invoiceRef(ar.invoice)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isCredit ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                          <CreditCard size={10} />
                          Crédito
                          {ar.invoice.saleOrder.installments
                            ? ` · ${ar.invoice.saleOrder.installments}c`
                            : ''}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
                          Contado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(ar.dueDate)}</td>
                    <td className="px-4 py-3">
                      <ARStatusBadge status={ar.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted">
                      {formatPrice(effectiveTotal)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600">
                      {formatPrice(effectivePaid)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-ink">
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
