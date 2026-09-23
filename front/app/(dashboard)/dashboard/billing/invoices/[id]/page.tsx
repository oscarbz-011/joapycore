'use client';

import { RequirePermission } from '@/components/require-permission';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, RotateCw, Send, AlertTriangle } from 'lucide-react';
import { billingApi, canRetryInvoicePdf, type InvoiceStatus, type IssueInvoicePayload, type PaymentMethod } from '../../../../../../lib/api/billing';
import { settingsApi } from '../../../../../../lib/api/settings';
import { openPdf } from '../../../../../../lib/open-pdf';
import { formatDatePY, parseISODate, toISODate } from '../../../../../../lib/date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING:   'Borrador',
  ISSUED:    'Emitida',
  PAID:      'Pagada',
  CANCELLED: 'Cancelada',
};

const STATUS_CLASS: Partial<Record<InvoiceStatus, string>> = {
  PENDING: 'bg-warn-subtle text-warn border-warn/30',
  ISSUED:  'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  PAID:    'bg-accent-subtle text-accent-on border-accent-on/20',
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge variant={status === 'CANCELLED' ? 'destructive' : 'outline'} className={STATUS_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

// ── Row helper ─────────────────────────────────────────────────────────────────

// Espeja BACK/src/modules/finance/services/loans.service.ts:computeFirstDueDate
// — mismo algoritmo exacto (UTC, garantiza al menos un mes de plazo antes del
// primer vencimiento). Si se toca uno, tocar el otro. La versión anterior acá
// usaba fecha local con la condición invertida (nunca daba 2 meses de salto),
// por eso una venta cargada el 01/09 con corte día 5 vencía el 05/09 (4 días
// de plazo) en vez del 05/10.
function computeFirstDueDateISO(dueDayOfMonth: number): string {
  const today = new Date();
  const monthsAhead = today.getUTCDate() > dueDayOfMonth ? 2 : 1;
  return toISODate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthsAhead, dueDayOfMonth)));
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH:          'Efectivo',
  BANK_TRANSFER: 'Transferencia bancaria',
  CARD:          'Tarjeta (débito/crédito)',
  PAGO_EXPRESS:  'PagoExpress',
  AQUI_PAGO:     'AquíPago',
  CHECK:         'Cheque',
};

const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
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

  const { data: creditConfig } = useQuery({
    queryKey: ['credit-config'],
    queryFn: settingsApi.getCredit,
  });
  const dueDayOfMonth = creditConfig?.dueDayOfMonth ?? 5;

  const [form, setForm] = useState<IssueInvoicePayload>({
    paymentCondition: 'CASH',
    dueDate: '',
    paymentMethod: undefined,
    notes: '',
  });
  const [formReady, setFormReady] = useState(false);
  // Día del mes elegido para el vencimiento de la 1ª cuota — no una fecha de
  // calendario arbitraria, es "qué día de cada mes" (mismo concepto que
  // CreditConfig.dueDayOfMonth, capado 1-28). form.dueDate es la fecha
  // concreta ya resuelta que se manda al backend.
  const [selectedDay, setSelectedDay] = useState<number>(dueDayOfMonth);

  // Inicialización única cuando llega la factura. Se hace durante el render
  // (patrón "ajustar estado a partir de props" de React) y no en un efecto,
  // para no pintar un render con el formulario vacío y re-renderizar.
  if (invoice && !formReady) {
    const isCredit = invoice.saleOrder.saleType === 'CREDIT';
    setForm({
      paymentCondition: isCredit ? 'CREDIT' : 'CASH',
      dueDate: isCredit
        ? (invoice.dueDate ? invoice.dueDate.slice(0, 10) : computeFirstDueDateISO(dueDayOfMonth))
        : '',
      paymentMethod: invoice.paymentMethod ?? undefined,
      notes: invoice.notes ?? '',
    });
    if (isCredit) {
      setSelectedDay(invoice.dueDate ? (parseISODate(invoice.dueDate)?.getUTCDate() ?? dueDayOfMonth) : dueDayOfMonth);
    }
    setFormReady(true);
  }

  // Solo recalcula la fecha concreta cuando el usuario cambia el día — si ya
  // había un dueDate real guardado y no lo tocó, se manda tal cual (recalcular
  // con "hoy" como ancla podría dar un mes distinto al que ya está guardado).
  function handleDayChange(day: number) {
    setSelectedDay(day);
    setForm((f) => ({ ...f, dueDate: computeFirstDueDateISO(day) }));
  }

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const issueMutation = useMutation({
    networkMode: 'always',
    mutationFn: () =>
      billingApi.issueInvoice(id, {
        paymentCondition: form.paymentCondition,
        dueDate: form.dueDate || undefined,
        paymentMethod: form.paymentMethod,
        notes: form.notes || undefined,
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const retryPdfMutation = useMutation({
    networkMode: 'always',
    mutationFn: () => billingApi.retryInvoicePdf(id),
    onSettled: () => {
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

  if (isLoading) {
    return <div className="py-24 text-center text-sm text-muted-foreground/60">Cargando factura...</div>;
  }

  if (error || !invoice) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground/60">No se encontró la factura.</p>
        <button onClick={() => router.back()} className="mt-3 text-sm font-medium text-foreground underline underline-offset-2">
          Volver
        </button>
      </div>
    );
  }

  const isPending = invoice.status === 'PENDING';
  const canCancel = invoice.status === 'PENDING' || invoice.status === 'ISSUED';
  const customer = invoice.saleOrder.customer;
  const invoiceRef = invoice.invoiceNumber
    ? `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber}`
    : `#${invoice.id.slice(0, 8).toUpperCase()}`;
  const isCredit = invoice.saleOrder.saleType === 'CREDIT';
  const canIssue = isCredit ? !!form.dueDate : !!form.paymentMethod;
  const canRetryPdf = canRetryInvoicePdf(invoice);

  return (
    <div className="max-w-5xl">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.push('/dashboard/billing')}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} />
        Facturas
      </button>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              {customer.firstName} {customer.lastName}
            </h1>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer.email && <span>{customer.email} · </span>}
            <span className="font-mono">{invoiceRef}</span>
          </p>
        </div>
        {(invoice.pdfFileId || canRetryPdf) && (invoice.pdfFileId ? (
          <Button variant="outline" onClick={() => void openPdf(invoice.pdfFileId!)}>
            <Printer size={15} /> Imprimir
          </Button>
        ) : (
          <RequirePermission permission="billing:issue">
            <Button variant="outline" disabled={retryPdfMutation.isPending} onClick={() => retryPdfMutation.mutate()}>
              <RotateCw size={15} /> {retryPdfMutation.isPending ? 'Regenerando...' : 'Regenerar PDF'}
            </Button>
          </RequirePermission>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* LEFT: Customer + Items + Timeline */}
        <div className="space-y-5">
          {/* Customer */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Cliente</h2>
            <InfoRow label="Nombre" value={`${customer.firstName} ${customer.lastName}`} />
            {customer.email && <InfoRow label="Email" value={customer.email} />}
            {customer.documentNumber && (
              <InfoRow label="Documento" value={`${customer.documentType ?? 'C.I.'} ${customer.documentNumber}`} />
            )}
          </section>

          {/* Items */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Detalle</h2>
            </div>
            {(() => {
              const itemsSubtotal = invoice.items.reduce((s, it) => s + Number(it.total), 0);
              const invoiceTotal  = Number(invoice.total);
              return (
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    <tr>
                      <th className="px-5 py-3 text-left">Descripción</th>
                      <th className="px-5 py-3 text-center w-16">Cant.</th>
                      {!isCredit && <th className="px-5 py-3 text-right">P. Unit.</th>}
                      <th className="px-5 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoice.items.map((item) => {
                      const displayTotal = isCredit && itemsSubtotal > 0
                        ? invoiceTotal * (Number(item.total) / itemsSubtotal)
                        : Number(item.total);
                      return (
                        <tr key={item.id}>
                          <td className="px-5 py-3">
                            <p className="font-medium text-foreground">{item.description}</p>
                            {item.ivaRate ? <p className="text-xs text-muted-foreground/60">IVA {item.ivaRate}%</p> : null}
                          </td>
                          <td className="px-5 py-3 text-center text-muted-foreground tabular-nums">{item.quantity}</td>
                          {!isCredit && (
                            <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                              {formatPrice(Number(item.unitPrice))}
                            </td>
                          )}
                          <td className="px-5 py-3 text-right font-medium text-foreground tabular-nums">
                            {formatPrice(displayTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
            <div className="flex justify-between items-center px-5 py-4 border-t border-border bg-muted/30">
              <span className="text-sm font-semibold text-muted-foreground">Total</span>
              <span className="text-lg font-bold text-foreground tabular-nums">
                {formatPrice(Number(invoice.total))}
              </span>
            </div>
          </section>

          {/* Timeline */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Historial</h2>
            <InfoRow label="Creada" value={formatDatePY(invoice.createdAt, 'local')} />
            <InfoRow label="Emitida" value={formatDatePY(invoice.issuedAt, 'local')} />
            <InfoRow label="Vencimiento" value={formatDatePY(invoice.dueDate, 'utc')} />
          </section>
        </div>

        {/* RIGHT: Emission form / info + Actions */}
        <div className="space-y-5">
          {isPending ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-4">Emisión</h2>

              {/* Payment condition — read-only */}
              <div className="mb-4 space-y-1.5">
                <Label>Condición de venta</Label>
                <div className="flex items-center gap-2 h-9 rounded-3xl border border-border bg-muted/30 px-3 text-sm cursor-default select-none">
                  <Badge variant="outline" className={isCredit
                    ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800'
                    : 'bg-accent-subtle text-accent-on border-accent-on/20'
                  }>
                    {isCredit ? 'Crédito' : 'Contado'}
                  </Badge>
                  {isCredit && invoice.saleOrder.installments && (
                    <span className="text-xs text-muted-foreground/60">{invoice.saleOrder.installments} cuotas</span>
                  )}
                </div>
              </div>

              {/* Due date — credit only */}
              {isCredit && (
                <div className="mb-4 space-y-1.5">
                  <Label htmlFor="due-date">
                    Fecha de vencimiento de la 1ª cuota *
                    <span className="ml-1 font-normal text-muted-foreground/60">(por conv. día {dueDayOfMonth} de cada mes)</span>
                  </Label>
                  <Select value={String(selectedDay)} onValueChange={(v) => v && handleDayChange(Number(v))}>
                    <SelectTrigger id="due-date" className="w-full">
                      <span className="min-w-0 flex-1 truncate text-left text-sm">Día {selectedDay}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={String(day)}>Día {day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground/60">
                    Vence el {formatDatePY(form.dueDate, 'utc')}. Si la cambiás, se reprograma todo el cronograma de cuotas a partir de esta fecha.
                  </p>
                </div>
              )}

              {/* Payment method — cash only */}
              {!isCredit && (
                <div className="mb-4 space-y-1.5">
                  <Label htmlFor="payment-method">Método de pago *</Label>
                  <Select
                    value={form.paymentMethod || 'none'}
                    onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v === 'none' ? undefined : v as PaymentMethod }))}
                  >
                    <SelectTrigger className="w-full">
                      <span className="flex-1 text-left text-sm truncate">
                        {form.paymentMethod ? PAYMENT_METHOD_LABELS[form.paymentMethod] : 'Seleccionar método...'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Seleccionar método...</SelectItem>
                      {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                        <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Notes */}
              <div className="mb-5 space-y-1.5">
                <Label>Notas</Label>
                <textarea
                  rows={3}
                  className={TEXTAREA_CLS}
                  placeholder="Observaciones para la factura..."
                  value={form.notes ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {issueMutation.isError && (
                <p className="mb-3 text-xs text-destructive">
                  {apiErrorMessage(issueMutation.error, 'Error al emitir la factura')}
                </p>
              )}

              <RequirePermission permission="billing:issue">
                <Button
                  className="w-full"
                  onClick={() => issueMutation.mutate()}
                  disabled={!canIssue || issueMutation.isPending}
                >
                  <Send size={15} />
                  {issueMutation.isPending ? 'Generando PDF y emitiendo...' : issueMutation.isError ? 'Reintentar emisión' : 'Emitir factura'}
                </Button>
              </RequirePermission>
            </section>
          ) : (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Detalles de emisión</h2>
              <InfoRow
                label="Condición"
                value={invoice.saleOrder.saleType === 'CREDIT'
                  ? `Crédito${invoice.saleOrder.installments ? ` · ${invoice.saleOrder.installments} cuotas` : ''}`
                  : 'Contado'}
              />
              {(invoice.invoiceNumber || invoice.invoicePrefix) && (
                <InfoRow label="N° Factura" value={`${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber ?? ''}`} />
              )}
              {invoice.notes && <InfoRow label="Notas" value={invoice.notes} />}

              {(invoice.status === 'ISSUED' || invoice.status === 'PAID') && (
                <div className="mt-4">
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={retryPdfMutation.isPending}
                    onClick={() => invoice.pdfFileId ? void openPdf(invoice.pdfFileId) : retryPdfMutation.mutate()}
                  >
                    {invoice.pdfFileId ? <Printer size={15} /> : <RotateCw size={15} />}
                    {invoice.pdfFileId ? 'Imprimir / descargar PDF' : retryPdfMutation.isPending ? 'Regenerando PDF...' : 'Regenerar PDF'}
                  </Button>
                  {retryPdfMutation.isError && (
                    <p className="mt-2 text-xs text-destructive">
                      {apiErrorMessage(retryPdfMutation.error, 'No se pudo regenerar el PDF')}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Cancel zone */}
          {canCancel && (
            <section className="rounded-xl border border-destructive/20 bg-destructive/10 p-5">
              {!showCancelForm ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-destructive">Cancelar factura</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {invoice.status === 'ISSUED' ? 'Se generará una nota de crédito.' : 'Se descartará el borrador.'}
                    </p>
                  </div>
                  <RequirePermission permission="billing:cancel">
                    <button
                      type="button"
                      onClick={() => setShowCancelForm(true)}
                      className="text-sm font-medium text-destructive underline underline-offset-2 hover:opacity-80"
                    >
                      Cancelar
                    </button>
                  </RequirePermission>
                </div>
              ) : (
                <div>
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-destructive" />
                    <p className="text-xs text-destructive">
                      {invoice.status === 'ISSUED'
                        ? 'Al cancelar una factura emitida se generará automáticamente una nota de crédito.'
                        : 'Esta acción descartará el borrador. No se generará nota de crédito.'}
                    </p>
                  </div>
                  <div className="space-y-1.5 mb-3">
                    <Label className="text-destructive">Motivo *</Label>
                    <textarea
                      rows={2}
                      className="w-full min-w-0 rounded-2xl border border-destructive/30 bg-card px-3 py-2 text-sm outline-none resize-none focus-visible:border-destructive focus-visible:ring-3 focus-visible:ring-destructive/30 transition-[box-shadow,border-color]"
                      placeholder="Ej: Error en los items, cliente solicitó cambios..."
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                  </div>
                  {cancelMutation.isError && (
                    <p className="mb-2 text-xs text-destructive">
                      {apiErrorMessage(cancelMutation.error, 'Error al cancelar')}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelReason.trim().length < 5 || cancelMutation.isPending}
                    >
                      {cancelMutation.isPending
                        ? 'Cancelando...'
                        : invoice.status === 'ISSUED'
                          ? 'Cancelar y emitir nota de crédito'
                          : 'Confirmar cancelación'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => { setShowCancelForm(false); setCancelReason(''); }}
                    >
                      Volver
                    </Button>
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
