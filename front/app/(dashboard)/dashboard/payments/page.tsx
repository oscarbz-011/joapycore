'use client';

import { RequirePermission } from '@/components/require-permission';

import { paymentMethodLabel } from '@/lib/payment-methods';

import { apiErrorMessage } from '@/lib/api/api-error';

import { Fragment, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NumericInput } from '../../../../components/numeric-input';
import { X, Printer, FileText, CreditCard, ChevronRight, AlertTriangle, Clock, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  paymentsApi,
  PAYMENT_METHOD_LABELS,
  type AccountsReceivable,
  type ARStatus,
  type PaymentMethod,
  type RegisterPaymentPayload,
  type CollectionsSummary,
  type CollectionsRange,
} from '../../../../lib/api/payments';
import {
  financeApi,
  type Loan,
  type Installment,
  type InstallmentStatus,
} from '../../../../lib/api/finance';
import { billingApi, type InvoiceStatus } from '../../../../lib/api/billing';
import { openPdf } from '../../../../lib/open-pdf';
import { distributeAmount, outstandingOf, chargesTotalOf, type DistributedItem } from '../../../../lib/finance-distribute';
import { ReceiptButton } from '../../../../components/receipt-button';
import { arUrgency, arDisplayDueDate, DUE_SOON_DAYS, type ArUrgency, type ArUrgencyLevel } from '../../../../lib/ar-urgency';
import { daysOverdue } from '../../../../lib/overdue';
import { zeroChargeNotice } from '../../../../lib/finance-zero-charge';
import { formatDatePY, todayISODate, toISODate } from '../../../../lib/date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// ── Constants ──────────────────────────────────────────────────────────────────

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

const AR_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente', PARTIAL: 'Parcial', PAID: 'Pagado', CANCELLED: 'Cancelado',
};
const AR_TYPE_LABELS: Record<string, string> = {
  CASH: 'Solo contado', CREDIT: 'Solo crédito',
};
const PENDING_RANGE_LABELS: Record<CollectionsRange | 'all', string> = {
  day: 'hoy', week: 'esta semana', month: 'este mes', all: 'general',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(n);
}


function invoiceRef(ar: AccountsReceivable['invoice']) {
  if (ar.invoiceNumber) return `${ar.invoicePrefix ?? ''}${ar.invoiceNumber}`;
  return `#${ar.id.slice(0, 8).toUpperCase()}`;
}

// "Ventilador" / "Ventilador +2 más" — para no romper el ancho de la fila
// con facturas de muchos ítems distintos.
function productSummary(items: AccountsReceivable['invoice']['items']): string {
  if (items.length === 0) return '—';
  const [first, ...rest] = items;
  return rest.length === 0 ? first.description : `${first.description} +${rest.length} más`;
}

// Para crédito, el saldo real vive en las cuotas del préstamo (pueden
// diferir del AR si hubo reprogramaciones) — para contado, el AR es la
// única fuente. Mismo cálculo que antes vivía duplicado dentro de la
// tabla y en el total pendiente del header.
function effectiveAmounts(ar: AccountsReceivable) {
  const isCredit = ar.invoice.saleOrder.saleType === 'CREDIT';
  const loan = ar.invoice.saleOrder.loan;
  const paid = isCredit && loan
    ? loan.installments.reduce((s, i) => s + Number(i.paidAmount), 0)
    : Number(ar.paidAmount);
  const total = isCredit && loan ? Number(loan.totalAmount) : Number(ar.amount);
  return { isCredit, paid, total, pending: total - paid };
}

// [start, end) del rango elegido, como fechas ISO — mismo criterio día/semana
// (lunes a domingo)/mes que ya usa el backend en PaymentsService.getCollections(),
// pero acá alcanza con los componentes locales del navegador (se asume que
// quien mira la pantalla está en Paraguay, a diferencia del backend, que
// corre en un servidor de timezone desconocida y necesita anclar a
// America/Asuncion explícito).
function rangeBoundsISO(range: CollectionsRange): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const iso = (year: number, month: number, day: number) => toISODate(new Date(Date.UTC(year, month, day)));

  if (range === 'day') return { start: iso(y, m, d), end: iso(y, m, d + 1) };
  if (range === 'week') {
    const dow = now.getDay();
    const diffToMonday = dow === 0 ? 6 : dow - 1;
    const startDate = new Date(y, m, d - diffToMonday);
    return {
      start: iso(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()),
      end: iso(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 7),
    };
  }
  return { start: iso(y, m, 1), end: iso(y, m + 1, 1) };
}

// Mismo diseño de resaltado (barra izquierda + fecha coloreada) para
// "Vencida"/"Vence en N días" (rojo/ámbar) y "Pendiente" al contado (ámbar)
// — "Parcial"/"Pagado"/"Cancelado" no llevan acento, ya se distinguen bien
// solo con el badge de estado. Ver front/lib/ar-urgency.ts para el porqué
// crédito y contado se calculan distinto.
type RowAccent = 'destructive' | 'warn' | null;

function accentFor(level: ArUrgencyLevel): RowAccent {
  if (level === 'overdue') return 'destructive';
  if (level === 'due-soon' || level === 'pending') return 'warn';
  return null;
}

const ACCENT_BORDER: Record<Exclude<RowAccent, null>, string> = {
  destructive: 'border-l-destructive',
  warn: 'border-l-warn',
};

const ACCENT_TEXT: Record<Exclude<RowAccent, null>, string> = {
  destructive: 'font-medium text-destructive',
  warn: 'font-medium text-warn',
};

// ── Status badges ──────────────────────────────────────────────────────────────

const AR_STATUS_LABEL: Record<ARStatus, string> = {
  PENDING:   'Pendiente',
  PARTIAL:   'Parcial',
  PAID:      'Pagado',
  CANCELLED: 'Cancelado',
};

const AR_STATUS_CLASS: Partial<Record<ARStatus, string>> = {
  PENDING: 'bg-warn-subtle text-warn border-warn/30',
  PARTIAL: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  PAID:    'bg-accent-subtle text-accent-on border-accent-on/20',
};

function ARStatusBadge({ status, urgency }: { status: ARStatus; urgency?: ArUrgency }) {
  if (urgency?.level === 'overdue') {
    return (
      <Badge variant="destructive" className="gap-1 whitespace-nowrap">
        <AlertTriangle size={10} />
        Vencida · {urgency.days} {urgency.days === 1 ? 'día' : 'días'}
      </Badge>
    );
  }
  if (urgency?.level === 'due-soon') {
    return (
      <Badge variant="outline" className="gap-1 whitespace-nowrap bg-warn-subtle text-warn border-warn/30">
        <Clock size={10} />
        Cuota {urgency.installmentNumber} vence en {urgency.days} {urgency.days === 1 ? 'día' : 'días'}
      </Badge>
    );
  }
  return (
    <Badge
      variant={status === 'CANCELLED' ? 'destructive' : 'outline'}
      className={AR_STATUS_CLASS[status]}
    >
      {AR_STATUS_LABEL[status]}
    </Badge>
  );
}

const INV_STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING:   'Borrador',
  ISSUED:    'Emitida',
  PAID:      'Pagada',
  CANCELLED: 'Cancelada',
};

const INV_STATUS_CLASS: Partial<Record<InvoiceStatus, string>> = {
  PENDING: 'bg-warn-subtle text-warn border-warn/30',
  ISSUED:  'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  PAID:    'bg-accent-subtle text-accent-on border-accent-on/20',
};

function InvStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge
      variant={status === 'CANCELLED' ? 'destructive' : 'outline'}
      className={INV_STATUS_CLASS[status]}
    >
      {INV_STATUS_LABEL[status]}
    </Badge>
  );
}

const INST_STATUS_LABEL: Record<InstallmentStatus, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID:    'Pagada',
  OVERDUE: 'Vencida',
};

const INST_STATUS_CLASS: Partial<Record<InstallmentStatus, string>> = {
  // "Pendiente" sin apuro queda deliberadamente neutro (gris) — no hay
  // necesidad de resaltar una cuota que recién vence dentro de varios meses,
  // solo la que está vencida o por vencer (ver installmentUrgency abajo).
  PENDING: 'bg-muted/30 text-muted-foreground border-border',
  PARTIAL: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  PAID:    'bg-accent-subtle text-accent-on border-accent-on/20',
};

// Mismo criterio que arUrgency() (ver ar-urgency.ts): calcula "vencida"/"por
// vencer" sobre la fecha real de la cuota, no sobre `status`, que solo lo
// actualiza el cron nocturno — una cuota recién vencida (o cualquier corrida
// antes de medianoche) puede seguir en PENDING en la base.
function installmentUrgency(inst: Installment): { level: ArUrgencyLevel; days: number } {
  if (inst.status === 'PAID') return { level: null, days: 0 };
  const overdueDays = daysOverdue(inst.dueDate);
  if (overdueDays > 0) return { level: 'overdue', days: overdueDays };
  const daysUntil = -overdueDays;
  if (daysUntil <= DUE_SOON_DAYS) return { level: 'due-soon', days: daysUntil };
  return { level: null, days: 0 };
}

function InstallmentStatusBadge({ status, urgency }: { status: InstallmentStatus; urgency: { level: ArUrgencyLevel; days: number } }) {
  if (urgency.level === 'overdue') {
    return (
      <Badge variant="destructive" className="gap-1 whitespace-nowrap">
        <AlertTriangle size={10} />
        Vencida · {urgency.days} {urgency.days === 1 ? 'día' : 'días'}
      </Badge>
    );
  }
  if (urgency.level === 'due-soon') {
    return (
      <Badge variant="outline" className="gap-1 whitespace-nowrap bg-warn-subtle text-warn border-warn/30">
        <Clock size={10} />
        Vence en {urgency.days} {urgency.days === 1 ? 'día' : 'días'}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={INST_STATUS_CLASS[status]}>
      {INST_STATUS_LABEL[status]}
    </Badge>
  );
}

// ── Invoice detail modal ───────────────────────────────────────────────────────

function InvoiceDetailModal({
  invoiceId,
  open,
  onOpenChange,
}: {
  invoiceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => billingApi.getInvoice(invoiceId),
    enabled: open,
  });

  const customer = invoice?.saleOrder.customer;
  const ref = invoice
    ? invoice.invoiceNumber
      ? `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber}`
      : `#${invoice.id.slice(0, 8).toUpperCase()}`
    : '…';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 p-0 overflow-hidden sm:max-w-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-muted-foreground/60" />
            <div>
              <DialogTitle className="text-base font-semibold">Factura {ref}</DialogTitle>
              {invoice && (
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  Emitida: {formatDatePY(invoice.issuedAt ?? invoice.createdAt, 'local')}
                </p>
              )}
            </div>
            {invoice && <InvStatusBadge status={invoice.status} />}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5 max-h-[calc(90vh-130px)]">
          {isLoading && (
            <p className="py-10 text-center text-sm text-muted-foreground/60">Cargando factura…</p>
          )}

          {invoice && (
            <>
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-muted/30 px-4 py-3 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Cliente</p>
                  <p className="font-semibold text-foreground">
                    {customer?.firstName} {customer?.lastName}
                  </p>
                  {customer?.email && (
                    <p className="text-muted-foreground text-xs">{customer.email}</p>
                  )}
                  {customer?.documentNumber && (
                    <p className="text-muted-foreground text-xs">
                      {customer.documentType ?? 'CI'}: {customer.documentNumber}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Tipo de venta</p>
                  <p className="text-foreground">
                    {invoice.saleOrder.saleType === 'CREDIT'
                      ? `Crédito${invoice.saleOrder.installments ? ` · ${invoice.saleOrder.installments} cuotas` : ''}`
                      : 'Contado'}
                  </p>
                  {invoice.dueDate && (
                    <p className="text-muted-foreground text-xs mt-1">
                      Venc.: {formatDatePY(invoice.dueDate, 'utc')}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                  Detalle de productos
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Descripción</th>
                        <th className="px-4 py-2.5 text-center">Cant.</th>
                        <th className="px-4 py-2.5 text-right">Precio unit.</th>
                        <th className="px-4 py-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoice.items.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/20">
                          <td className="px-4 py-2.5 text-muted-foreground">{item.description}</td>
                          <td className="px-4 py-2.5 text-center text-muted-foreground">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                            {formatPrice(Number(item.unitPrice))}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium text-foreground">
                            {formatPrice(Number(item.total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-foreground">
                        <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground">
                          TOTAL
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-base font-bold text-foreground">
                          {formatPrice(Number(invoice.total))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {invoice.notes && (
                <div className="rounded-xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  <span className="font-medium">Notas: </span>
                  {invoice.notes}
                </div>
              )}
            </>
          )}
        </div>

        {invoice && (
          <div className="border-t border-border px-6 py-4 flex justify-between items-center shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            <Button disabled={!invoice.pdfFileId} onClick={() => invoice.pdfFileId && void openPdf(invoice.pdfFileId)}>
              <Printer size={15} />
              {invoice.pdfFileId ? 'Imprimir factura' : 'PDF no disponible'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Register payment modal ─────────────────────────────────────────────────────

function RegisterPaymentModal({
  ar,
  open,
  onOpenChange,
  onSaved,
}: {
  ar: AccountsReceivable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const remaining = Number(ar.amount) - Number(ar.paidAmount);

  const [amount, setAmount] = useState<number>(Math.round(remaining));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [date, setDate] = useState(todayISODate());
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
      onSaved();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al registrar el pago'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 p-0 overflow-hidden sm:max-w-md">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <DialogTitle className="text-base font-semibold">Registrar cobro</DialogTitle>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {ar.invoice.saleOrder.customer.firstName} {ar.invoice.saleOrder.customer.lastName}
              {' · '}Saldo: {formatPrice(remaining)}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}
          className="px-6 py-5 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Monto (PYG) *</Label>
              <NumericInput value={amount} onChange={setAmount} className={NUM_CLS} required />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha *</Label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Método de pago *</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">{PAYMENT_METHOD_LABELS[method]}</span>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((key) => (
                  <SelectItem key={key} value={key}>{PAYMENT_METHOD_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Referencia / Comprobante</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="N° transferencia, cheque..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Registrando...' : 'Confirmar cobro'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Pay installments modal (selección múltiple, un solo recibo) ────────────────

function PayInstallmentsModal({
  loanId,
  saleOrderId,
  items,
  open,
  onOpenChange,
  onSaved,
}: {
  loanId: string;
  saleOrderId: string;
  items: DistributedItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const totalAmount = items.reduce((s, i) => s + i.amount, 0);

  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [date, setDate] = useState(todayISODate());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      financeApi.payInstallments(loanId, {
        items: items.map((i) => ({ installmentId: i.installmentId, amount: i.amount })),
        paymentMethod: method,
        paymentReference: reference.trim() || undefined,
        paymentDate: date,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['accounts-receivable'] });
      void queryClient.invalidateQueries({ queryKey: ['loan-by-order', saleOrderId] });
      if (data.receipt?.pdfFileId) void openPdf(data.receipt.pdfFileId);
      onSaved();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al registrar el cobro'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 p-0 overflow-hidden sm:max-w-md">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <DialogTitle className="text-base font-semibold">
              Cobrar {items.length} cuota{items.length !== 1 ? 's' : ''}
            </DialogTitle>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              Total: {formatPrice(totalAmount)}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}
          className="px-6 py-5 space-y-4"
        >
          <div className="rounded-lg bg-muted/30 px-3 py-2 space-y-1">
            {items.map((i) => (
              <div key={i.installmentId} className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Cuota #{i.number}{!i.isFull && ' (parcial)'}
                </span>
                <span className="font-medium text-foreground">{formatPrice(i.amount)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Fecha *</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          <div className="space-y-1.5">
            <Label>Método de pago *</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">{PAYMENT_METHOD_LABELS[method]}</span>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((key) => (
                  <SelectItem key={key} value={key}>{PAYMENT_METHOD_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Referencia / Comprobante</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="N° recibo, transferencia..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Registrando...' : 'Confirmar cobro'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Credit AR detail ──────────────────────────────────────────────────────────

function CreditARDetail({
  saleOrderId,
  onInstallmentPaid,
}: {
  saleOrderId: string;
  onInstallmentPaid: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [amountInput, setAmountInput] = useState<number>(0);
  const [payModalOpen, setPayModalOpen] = useState(false);

  const { data: loan, isLoading, error } = useQuery<Loan>({
    queryKey: ['loan-by-order', saleOrderId],
    queryFn: () => financeApi.getLoanByOrder(saleOrderId),
    retry: false,
  });

  function toggleInstallment(inst: Installment) {
    setSelected((prev) => {
      if (prev[inst.id] != null) {
        const next = { ...prev };
        delete next[inst.id];
        return next;
      }
      return { ...prev, [inst.id]: outstandingOf(inst) };
    });
  }

  function applyAmountPreview() {
    if (!loan) return;
    const { items } = distributeAmount(loan.installments, amountInput);
    const next: Record<string, number> = {};
    for (const item of items) next[item.installmentId] = item.amount;
    setSelected(next);
  }

  if (isLoading) {
    return <p className="py-4 text-center text-sm text-muted-foreground/60">Cargando cuotas...</p>;
  }

  if (!loan) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    const msg =
      status === 403
        ? 'El módulo de finanzas no está habilitado para este tenant.'
        : status === 404
          ? 'El préstamo aún no fue generado para esta venta. Verificá que el crédito fue aprobado correctamente.'
          : 'No se pudo cargar el plan de cuotas.';
    return <p className="py-4 text-center text-sm text-muted-foreground/60">{msg}</p>;
  }

  const installmentAmount    = Number(loan.installments[0]?.amount ?? 0);
  const paidFromInstallments = loan.installments.reduce((s, i) => s + Number(i.paidAmount), 0);
  const totalCredit          = Number(loan.totalAmount);
  const outstandingPrincipal = loan.installments.reduce((sum, installment) => sum + Math.max(Number(installment.amount) - Number(installment.paidAmount), 0), 0);
  const moraTotal = loan.installments.reduce((sum, installment) => sum + chargesTotalOf(installment), 0);
  const totalOutstanding = outstandingPrincipal + moraTotal;
  const overdueInstallments = loan.installments.filter((installment) => installmentUrgency(installment).level === 'overdue');
  const overduePrincipal = overdueInstallments.reduce((sum, installment) => sum + Math.max(Number(installment.amount) - Number(installment.paidAmount), 0), 0);
  const totalOverdue = overduePrincipal + moraTotal;
  const moraGraceDays = loan.moraPolicy?.graceDays ?? 0;
  const hasMoraComponents = (loan.moraPolicy?.components.length ?? 0) > 0;
  const creditPct            = totalCredit > 0 ? (paidFromInstallments / totalCredit) * 100 : 0;
  const amountPreview        = amountInput > 0 ? distributeAmount(loan.installments, amountInput) : null;
  const selectedTotal        = Object.values(selected).reduce((s, a) => s + a, 0);
  const selectedCount        = Object.keys(selected).length;
  const selectedItems: DistributedItem[] = loan.installments
    .filter((i) => selected[i.id] != null)
    .map((i) => {
      const outstanding = outstandingOf(i);
      const amount = selected[i.id];
      return { installmentId: i.id, number: i.number, amount, isFull: amount >= outstanding };
    });

  return (
    <>
      <div className="rounded-xl bg-muted/30 border border-border px-4 py-3 text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Capital financiado</span>
          <span className="font-medium text-foreground">{formatPrice(Number(loan.principal))}</span>
        </div>
        {Number(loan.interestRate) > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tasa de interés</span>
            <span className="text-foreground">{Number(loan.interestRate)}%</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2">
          <span className="font-semibold text-muted-foreground">Total a crédito</span>
          <span className="font-bold text-foreground">{formatPrice(totalCredit)}</span>
        </div>
        {overdueInstallments.length > 0 && moraTotal === 0 && (
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
            {zeroChargeNotice({
              graceDays: moraGraceDays,
              hasMoraComponents,
              overdueDays: overdueInstallments.map((installment) => installmentUrgency(installment).days),
            })}
          </p>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cobrado</span>
          <span className="font-medium text-emerald-600">{formatPrice(paidFromInstallments)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Saldo de cuotas</span>
          <span className="font-medium text-foreground">{formatPrice(outstandingPrincipal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Recargos e intereses</span>
          <span className={cn('font-medium', moraTotal > 0 ? 'text-destructive' : 'text-foreground')}>
            {moraTotal > 0 ? '+' : ''}{formatPrice(moraTotal)}
          </span>
        </div>
        {overdueInstallments.length > 0 && (
          <div className="flex justify-between text-destructive">
            <span className="font-medium">Total vencido</span>
            <span className="font-semibold">{formatPrice(totalOverdue)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2">
          <span className="font-semibold text-foreground">Total adeudado hoy</span>
          <span className="font-bold text-foreground">{formatPrice(totalOutstanding)}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted/20">
          <div
            className="h-2 rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(creditPct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground/60">
          {loan.totalInstallments} cuotas de {formatPrice(installmentAmount)} c/u
        </p>
      </div>

      {/* Cobro por monto — autoselecciona las cuotas pendientes más antiguas */}
      <div className="rounded-xl border border-border px-3 py-2.5 space-y-2">
        <Label className="text-xs">¿Cuántas cuotas cubre un monto?</Label>
        <div className="flex gap-2">
          <NumericInput value={amountInput} onChange={setAmountInput} className={NUM_CLS} placeholder="Monto a pagar" />
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={applyAmountPreview} disabled={amountInput <= 0}>
            Autoseleccionar
          </Button>
        </div>
        {amountPreview && (
          <p className="text-xs text-muted-foreground">
            {amountPreview.items.length === 0
              ? 'No hay cuotas pendientes para cubrir.'
              : `Cubre ${amountPreview.items.length} cuota${amountPreview.items.length !== 1 ? 's' : ''}${!amountPreview.items[amountPreview.items.length - 1]?.isFull ? ' (la última, parcial)' : ''}.`}
            {amountPreview.remaining > 0 && (
              <span className="text-warn"> Sobran {formatPrice(amountPreview.remaining)} — supera el saldo pendiente total.</span>
            )}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        {loan.installments.map((inst) => {
          const charges = inst.interestCharges ?? [];
          const chargesTotal = chargesTotalOf(inst);
          const remaining = outstandingOf(inst);
          const isPayable =
            (inst.status === 'PENDING' || inst.status === 'PARTIAL' || inst.status === 'OVERDUE') &&
            remaining > 0;
          const isSelected = selected[inst.id] != null;
          const urgency = installmentUrgency(inst);
          const accent = accentFor(urgency.level);
          return (
            <div
              key={inst.id}
              className={cn(
                'flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 text-sm',
                accent && cn('border-l-[3px]', ACCENT_BORDER[accent]),
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isPayable && (
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-primary"
                    checked={isSelected}
                    onChange={() => toggleInstallment(inst)}
                  />
                )}
                <span className="shrink-0 w-5 text-xs font-mono text-muted-foreground/60">#{inst.number}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <InstallmentStatusBadge status={inst.status} urgency={urgency} />
                    <span className={cn('text-xs', accent ? ACCENT_TEXT[accent] : 'text-muted-foreground/60')}>{formatDatePY(inst.dueDate, 'utc')}</span>
                  </div>
                  <p className="font-medium text-foreground mt-0.5">
                    {formatPrice(Number(inst.amount))}
                    {Number(inst.paidAmount) > 0 && inst.status !== 'PAID' && (
                      <span className="ml-1 text-xs font-normal text-emerald-600">
                        · pagado: {formatPrice(Number(inst.paidAmount))}
                      </span>
                    )}
                    {isSelected && selected[inst.id] < remaining && (
                      <span className="ml-1 text-xs font-normal text-sky-600">
                        · a cobrar (parcial): {formatPrice(selected[inst.id])}
                      </span>
                    )}
                  </p>
                  {chargesTotal > 0 && (
                    <div className="mt-1 space-y-0.5 rounded-md border border-destructive/25 bg-destructive/5 px-2 py-1.5">
                      {charges.map((c) => (
                        <div key={c.id} className="flex justify-between gap-3 text-xs text-destructive">
                          <span className="truncate">{c.component.name}</span>
                          <span className="shrink-0">+{formatPrice(Number(c.amount))}</span>
                        </div>
                      ))}
                      <div className="flex justify-between gap-3 border-t border-destructive/20 pt-0.5 text-xs font-semibold text-destructive">
                        <span>Total a pagar (cuota + recargos)</span>
                        <span className="shrink-0">{formatPrice(remaining)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="ml-2 flex items-center gap-1.5 shrink-0">
                {Number(inst.paidAmount) > 0 && <ReceiptButton installmentId={inst.id} />}
              </div>
            </div>
          );
        })}
      </div>

      {selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="text-sm">
            <p className="font-semibold text-foreground">{formatPrice(selectedTotal)}</p>
            <p className="text-xs text-muted-foreground">{selectedCount} cuota{selectedCount !== 1 ? 's' : ''} seleccionada{selectedCount !== 1 ? 's' : ''}</p>
          </div>
          <RequirePermission permission="finance:payments:apply">
            <Button size="sm" onClick={() => setPayModalOpen(true)}>
              Cobrar seleccionadas
            </Button>
          </RequirePermission>
        </div>
      )}

      <a
        href="/dashboard/finance"
        className="flex items-center justify-center gap-1.5 rounded-3xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/20 transition-colors"
      >
        Ver en módulo de Finanzas
        <ChevronRight size={13} />
      </a>

      <PayInstallmentsModal
        loanId={loan.id}
        saleOrderId={saleOrderId}
        items={selectedItems}
        open={payModalOpen}
        onOpenChange={(open) => { if (!open) setPayModalOpen(false); }}
        onSaved={() => {
          setPayModalOpen(false);
          setSelected({});
          setAmountInput(0);
          onInstallmentPaid();
        }}
      />
    </>
  );
}

// ── AR detail panel ────────────────────────────────────────────────────────────

function ARDetailPanel({
  ar,
  open,
  onOpenChange,
}: {
  ar: AccountsReceivable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [showRegister, setShowRegister] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const queryClient = useQueryClient();

  const isCredit  = ar.invoice.saleOrder.saleType === 'CREDIT';
  const urgency   = arUrgency(ar);
  const remaining = Number(ar.amount) - Number(ar.paidAmount);
  const pct       = Number(ar.amount) > 0 ? (Number(ar.paidAmount) / Number(ar.amount)) * 100 : 0;
  const ref       = invoiceRef(ar.invoice);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full max-w-sm flex-col p-0 sm:max-w-sm" showCloseButton>
          <SheetHeader className="border-b border-border px-5 py-4 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <SheetTitle>
                {ar.invoice.saleOrder.customer.firstName} {ar.invoice.saleOrder.customer.lastName}
              </SheetTitle>
              <ARStatusBadge status={ar.status} urgency={urgency} />
              {isCredit && (
                <Badge
                  variant="outline"
                  className="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800 gap-1"
                >
                  <CreditCard size={11} />
                  Crédito
                </Badge>
              )}
            </div>
            {ar.invoice.saleOrder.customer.email && (
              <SheetDescription>{ar.invoice.saleOrder.customer.email}</SheetDescription>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {/* Invoice reference */}
            <div className="border-b border-border px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Factura</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{ref}</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {formatDatePY(ar.invoice.issuedAt, 'local')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <InvStatusBadge status={ar.invoice.status as InvoiceStatus} />
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowInvoice(true)}>
                    <FileText size={13} />
                    Ver detalle
                  </Button>
                </div>
              </div>
            </div>

            {/* Cash: balance section */}
            {!isCredit && (
              <div className="border-b border-border px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Saldo</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total factura</span>
                    <span className="font-medium text-foreground">{formatPrice(Number(ar.amount))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pagado</span>
                    <span className="font-medium text-emerald-600">{formatPrice(Number(ar.paidAmount))}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted/30">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="font-semibold text-muted-foreground">Saldo pendiente</span>
                    <span className="font-bold text-foreground">{formatPrice(remaining)}</span>
                  </div>
                </div>
                {ar.dueDate && (
                  <p className={cn('text-xs mt-2', urgency.level === 'overdue' ? 'font-medium text-destructive' : 'text-muted-foreground/60')}>
                    Vencimiento: {formatDatePY(ar.dueDate, 'utc')}
                    {urgency.level === 'overdue' && ` · ${urgency.days} ${urgency.days === 1 ? 'día' : 'días'} de mora`}
                  </p>
                )}
              </div>
            )}

            {/* Credit: loan + installments */}
            {isCredit && (
              <div className="border-b border-border px-5 py-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
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

            {/* Payment history */}
            {ar.paymentRecords.length > 0 && (
              <div className="border-b border-border px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">
                  Historial de pagos
                </p>
                <div className="space-y-2">
                  {ar.paymentRecords.map((pr) => (
                    <div key={pr.id} className="rounded-lg bg-muted/30 px-3 py-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-foreground">
                          {formatPrice(Number(pr.amount))}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatDatePY(pr.paymentDate, 'utc')}</span>
                      </div>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        {PAYMENT_METHOD_LABELS[pr.paymentMethod]}
                        {pr.reference ? ` · ${pr.reference}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action: cash sales only */}
            {!isCredit && (ar.status === 'PENDING' || ar.status === 'PARTIAL') && (
              <div className="px-5 py-4">
                <RequirePermission permission="payments:register">
                  <Button className="w-full" onClick={() => setShowRegister(true)}>
                    Registrar pago
                  </Button>
                </RequirePermission>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <InvoiceDetailModal
        invoiceId={ar.invoice.id}
        open={showInvoice}
        onOpenChange={setShowInvoice}
      />

      <RegisterPaymentModal
        ar={ar}
        open={showRegister}
        onOpenChange={(open) => { if (!open) setShowRegister(false); }}
        onSaved={() => {
          setShowRegister(false);
          void queryClient.invalidateQueries({ queryKey: ['accounts-receivable'] });
          onOpenChange(false);
        }}
      />
    </>
  );
}

// ── Collections widget ─────────────────────────────────────────────────────────


const MES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const RANGE_OPTIONS: { value: CollectionsRange; label: string }[] = [
  { value: 'day',   label: 'Hoy' },
  { value: 'week',  label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
];

function CollectionsWidget({ range, onRangeChange }: { range: CollectionsRange; onRangeChange: (r: CollectionsRange) => void }) {
  const now = new Date();

  const { data, isLoading } = useQuery<CollectionsSummary>({
    queryKey: ['collections', range],
    queryFn:  () => paymentsApi.getCollections(range),
  });

  const rangeLabel =
    range === 'day' ? 'Hoy' : range === 'week' ? 'Esta semana' : `${MES_LARGO[now.getMonth()]} ${now.getFullYear()}`;
  const totalPct    = data && data.total > 0 ? Math.round((data.cash.total / data.total) * 100) : 0;
  const methodEntries = data ? Object.entries(data.byMethod).sort(([, a], [, b]) => b - a) : [];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Recaudaciones</p>
          <p className="text-sm text-muted-foreground">{rangeLabel}</p>
        </div>
        {!isLoading && data && (
          <p className="text-xl font-bold text-foreground">{formatPrice(data.total)}</p>
        )}
        {isLoading && <div className="h-5 w-32 animate-pulse rounded bg-muted/30" />}
      </div>

      <div className="flex gap-1 rounded-full bg-muted/20 p-1 w-fit">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onRangeChange(opt.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              range === opt.value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {data && data.total > 0 && (
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-muted/20 overflow-hidden flex gap-0.5">
            <div className="h-full rounded-l-full bg-emerald-500 transition-all" style={{ width: `${totalPct}%` }} />
            <div className="h-full rounded-r-full bg-violet-500 transition-all" style={{ width: `${100 - totalPct}%` }} />
          </div>
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Contado</span>
              <span className="font-semibold text-foreground ml-1">{formatPrice(data.cash.total)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
              <span className="text-muted-foreground">Crédito</span>
              <span className="font-semibold text-foreground ml-1">{formatPrice(data.credit.total)}</span>
            </div>
          </div>
        </div>
      )}

      {methodEntries.length > 0 && (
        <div className="border-t border-border pt-3 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">Por fuente</p>
          {methodEntries.map(([method, amount]) => {
            const pct = data!.total > 0 ? (amount / data!.total) * 100 : 0;
            return (
              <div key={method} className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{method === 'UNKNOWN' ? 'Sin método' : paymentMethodLabel(method)}</span>
                  <span className="font-medium text-foreground">{formatPrice(amount)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted/20">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && data && data.total === 0 && (
        <p className="text-center text-xs text-muted-foreground/60 py-2">
          Sin recaudaciones registradas {range === 'day' ? 'hoy' : range === 'week' ? 'esta semana' : 'este mes'}
        </p>
      )}
    </Card>
  );
}

// ── AR row (una factura — se usa sola o como sub-fila de un grupo por cliente) ──

function ARRow({ ar, onClick, indent }: { ar: AccountsReceivable; onClick: () => void; indent?: boolean }) {
  const { isCredit, paid, total, pending } = effectiveAmounts(ar);
  const urgency = arUrgency(ar);
  const accent = accentFor(urgency.level);
  return (
    <tr onClick={onClick} className="cursor-pointer hover:bg-muted/20 transition-colors">
      <td
        className={cn(
          'px-4 py-3',
          indent && 'pl-11',
          accent && cn('border-l-[3px]', ACCENT_BORDER[accent]),
        )}
      >
        <div className="font-medium text-foreground">
          {ar.invoice.saleOrder.customer.firstName}{' '}
          {ar.invoice.saleOrder.customer.lastName}
        </div>
        {ar.invoice.saleOrder.customer.email && (
          <div className="text-xs text-muted-foreground/60">
            {ar.invoice.saleOrder.customer.email}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-muted-foreground">
          {invoiceRef(ar.invoice)}
        </span>
      </td>
      <td className="px-4 py-3 max-w-[14rem] truncate text-muted-foreground" title={ar.invoice.items.map((i) => i.description).join(', ')}>
        {productSummary(ar.invoice.items)}
      </td>
      <td className="px-4 py-3">
        {isCredit ? (
          <Badge
            variant="outline"
            className="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800 gap-1"
          >
            <CreditCard size={10} />
            Crédito{ar.invoice.saleOrder.installments ? ` · ${ar.invoice.saleOrder.installments}c` : ''}
          </Badge>
        ) : (
          <Badge variant="secondary">Contado</Badge>
        )}
      </td>
      <td className={cn('px-4 py-3', accent ? ACCENT_TEXT[accent] : 'text-muted-foreground')}>
        {formatDatePY(arDisplayDueDate(ar), 'utc')}
      </td>
      <td className="px-4 py-3"><ARStatusBadge status={ar.status} urgency={urgency} /></td>
      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
        {formatPrice(total)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-emerald-600">
        {formatPrice(paid)}
      </td>
      <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
        {formatPrice(pending)}
      </td>
    </tr>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const searchParams = useSearchParams();
  const arParam = searchParams.get('ar');

  const [statusFilter, setStatusFilter] = useState<'' | ARStatus>('');
  const [typeFilter, setTypeFilter]     = useState<'' | 'CASH' | 'CREDIT'>('');
  const [search, setSearch]             = useState('');
  const [range, setRange]               = useState<CollectionsRange>('month');
  const [pendingRange, setPendingRange] = useState<CollectionsRange | 'all'>('all');
  const [panelAR, setPanelAR]           = useState<AccountsReceivable | null>(null);
  const [panelOpen, setPanelOpen]       = useState(false);
  const [dismissedArParam, setDismissedArParam] = useState<string | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const { data: arList = [], isLoading } = useQuery({
    queryKey: ['accounts-receivable'],
    queryFn: paymentsApi.listAR,
  });

  // Deep link desde el dropdown de Alertas ("Cuenta por cobrar vencida",
  // ?ar=<id>) — abre directo el detalle en vez de dejar al usuario buscarla
  // a mano en la lista. Derivado en el render (sin efecto) para no disparar
  // un setState en cuanto arList termina de cargar; `dismissedArParam`
  // recuerda si el usuario ya cerró este deep link para no reabrirlo solo.
  const deepLinkedAR =
    arParam && arParam !== dismissedArParam ? (arList.find((ar) => ar.id === arParam) ?? null) : null;
  const effectivePanelAR = panelAR ?? deepLinkedAR;
  const effectivePanelOpen = panelOpen || !!deepLinkedAR;

  // Sin filtro de estado explícito, se ocultan las ya pagadas en su
  // totalidad — no tiene sentido mostrar todas las cuentas por cobrar
  // (activas + saldadas hace tiempo) de entrada; el usuario las ve
  // eligiendo "Pagado" en el filtro a propósito.
  const searchNorm = search.trim().toLowerCase();
  const filtered = arList.filter((ar) => {
    if (statusFilter) {
      if (ar.status !== statusFilter) return false;
    } else if (ar.status === 'PAID') {
      return false;
    }
    if (typeFilter && ar.invoice.saleOrder.saleType !== typeFilter) return false;
    if (searchNorm) {
      const c = ar.invoice.saleOrder.customer;
      const haystack = [
        c.firstName, c.secondFirstName, c.lastName, c.secondLastName,
        c.email, c.documentNumber, c.customerCode,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(searchNorm)) return false;
    }
    return true;
  });

  // Agrupa las cuentas por cobrar por cliente — un cliente con varios
  // productos a crédito activos aparece una sola vez, con un dropdown para
  // ver cada producto (y su propio recibo) por separado.
  const groupsByCustomer = new Map<string, AccountsReceivable[]>();
  for (const ar of filtered) {
    const key = ar.invoice.saleOrder.customer.id;
    groupsByCustomer.set(key, [...(groupsByCustomer.get(key) ?? []), ar]);
  }
  const groups = Array.from(groupsByCustomer.values());

  function toggleExpanded(customerId: string) {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId); else next.add(customerId);
      return next;
    });
  }

  function openPanel(ar: AccountsReceivable) { setPanelAR(ar); setPanelOpen(true); }
  function closePanel(open: boolean) {
    if (open) return;
    setPanelOpen(false);
    if (!panelAR && arParam) setDismissedArParam(arParam);
  }

  // Vencimiento real de cada cuenta — para crédito, la cuota más próxima sin
  // pagar (arDisplayDueDate ya resuelve esto), no el AR.dueDate estático.
  // Una cuenta sin fecha de vencimiento (ej. contado sin AR.dueDate) no cae
  // en ningún rango puntual — solo se cuenta en "Este mes" como aproximación
  // razonable en vez de desaparecer de todos los rangos. "General" (default)
  // no filtra por fecha — es el monto total adeudado sin importar cuándo vence,
  // pedido aparte por el usuario además del recorte por día/semana/mes.
  const activePendingAR = arList.filter((ar) => ar.status === 'PENDING' || ar.status === 'PARTIAL');
  const totalPending = (() => {
    if (pendingRange === 'all') {
      return activePendingAR.reduce((sum, ar) => sum + effectiveAmounts(ar).pending, 0);
    }
    const { start, end } = rangeBoundsISO(pendingRange);
    return activePendingAR
      .filter((ar) => {
        const due = arDisplayDueDate(ar);
        if (!due) return pendingRange === 'month';
        return due >= start && due < end;
      })
      .reduce((sum, ar) => sum + effectiveAmounts(ar).pending, 0);
  })();

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Cuentas por Cobrar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cuentas por cobrar y registro de pagos</p>
        </div>
        {activePendingAR.length > 0 && (
          <div className="rounded-xl bg-warn-subtle border border-warn px-4 py-2 text-right space-y-1.5">
            <p className="text-xs text-warn font-medium">Total pendiente ({PENDING_RANGE_LABELS[pendingRange]})</p>
            <p className="text-lg font-bold text-warn">{formatPrice(totalPending)}</p>
            <div className="flex justify-end gap-0.5">
              {(['day', 'week', 'month', 'all'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPendingRange(v)}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-colors',
                    pendingRange === v
                      ? 'bg-card text-warn shadow-sm'
                      : 'text-warn/60 hover:text-warn',
                  )}
                >
                  {v === 'all' ? 'General' : PENDING_RANGE_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mb-6">
        <CollectionsWidget range={range} onRangeChange={setRange} />
      </div>

      <div className="mb-4 flex gap-3">
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v as ARStatus)}>
          <SelectTrigger>
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {statusFilter ? AR_STATUS_LABELS[statusFilter] : 'Activas (sin pagadas)'}
            </span>
          </SelectTrigger>
          <SelectContent className="w-auto min-w-[9rem]">
            <SelectItem value="all">Activas (sin pagadas)</SelectItem>
            <SelectItem value="PENDING">Pendiente</SelectItem>
            <SelectItem value="PARTIAL">Parcial</SelectItem>
            <SelectItem value="PAID">Pagado</SelectItem>
            <SelectItem value="CANCELLED">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <Input className="pl-8" placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v as 'CASH' | 'CREDIT')}>
          <SelectTrigger>
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {typeFilter ? AR_TYPE_LABELS[typeFilter] : 'Contado y crédito'}
            </span>
          </SelectTrigger>
          <SelectContent className="w-auto min-w-[9rem]">
            <SelectItem value="all">Contado y crédito</SelectItem>
            <SelectItem value="CASH">Solo contado</SelectItem>
            <SelectItem value="CREDIT">Solo crédito</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando cuentas por cobrar...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground/60">
            {arList.length === 0
              ? 'Las cuentas por cobrar se generan automáticamente al emitir una factura.'
              : 'No se encontraron cuentas con los filtros aplicados.'}
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Factura</th>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Vencimiento</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Pagado</th>
                  <th className="px-4 py-3 text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map((group) => {
                  if (group.length === 1) {
                    const ar = group[0];
                    return <ARRow key={ar.id} ar={ar} onClick={() => openPanel(ar)} />;
                  }

                  const customer = group[0].invoice.saleOrder.customer;
                  const isExpanded = expandedCustomers.has(customer.id);
                  const agg = group.reduce(
                    (acc, ar) => {
                      const a = effectiveAmounts(ar);
                      return { paid: acc.paid + a.paid, total: acc.total + a.total, pending: acc.pending + a.pending };
                    },
                    { paid: 0, total: 0, pending: 0 },
                  );
                  const overdueCount = group.filter((ar) => arUrgency(ar).level === 'overdue').length;
                  const pendingCount = group.filter((ar) => accentFor(arUrgency(ar).level) === 'warn').length;
                  const groupAccent: RowAccent = overdueCount > 0 ? 'destructive' : pendingCount > 0 ? 'warn' : null;

                  return (
                    <Fragment key={customer.id}>
                      <tr
                        onClick={() => toggleExpanded(customer.id)}
                        className="cursor-pointer hover:bg-muted/20 transition-colors bg-muted/10"
                      >
                        <td className={cn('px-4 py-3', groupAccent && cn('border-l-[3px]', ACCENT_BORDER[groupAccent]))}>
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              size={14}
                              className={cn('shrink-0 text-muted-foreground/60 transition-transform', isExpanded && 'rotate-90')}
                            />
                            <div>
                              <div className="font-medium text-foreground">
                                {customer.firstName} {customer.lastName}
                              </div>
                              {customer.email && (
                                <div className="text-xs text-muted-foreground/60">{customer.email}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground" colSpan={4}>
                          {group.length} productos activos
                          {overdueCount > 0 && (
                            <Badge variant="destructive" className="ml-2 gap-1">
                              <AlertTriangle size={10} />
                              {overdueCount} vencida{overdueCount !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          {pendingCount > 0 && (
                            <Badge variant="outline" className="ml-2 gap-1 bg-warn-subtle text-warn border-warn/30">
                              {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {formatPrice(agg.total)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600">
                          {formatPrice(agg.paid)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
                          {formatPrice(agg.pending)}
                        </td>
                      </tr>
                      {isExpanded && group.map((ar) => (
                        <ARRow key={ar.id} ar={ar} onClick={() => openPanel(ar)} indent />
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {effectivePanelAR && (
        <ARDetailPanel ar={effectivePanelAR} open={effectivePanelOpen} onOpenChange={closePanel} />
      )}
    </div>
  );
}
