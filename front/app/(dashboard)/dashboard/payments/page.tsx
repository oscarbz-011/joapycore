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
import { billingApi, type Invoice, type InvoiceStatus } from '../../../../lib/api/billing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

function ARStatusBadge({ status }: { status: ARStatus }) {
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
  PENDING: 'bg-warn-subtle text-warn border-warn/30',
  PARTIAL: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  PAID:    'bg-accent-subtle text-accent-on border-accent-on/20',
};

function InstallmentStatusBadge({ status }: { status: InstallmentStatus }) {
  return (
    <Badge
      variant={status === 'OVERDUE' ? 'destructive' : 'outline'}
      className={INST_STATUS_CLASS[status]}
    >
      {INST_STATUS_LABEL[status]}
    </Badge>
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
                  Emitida: {formatDate(invoice.issuedAt ?? invoice.createdAt)}
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
                      Venc.: {formatDate(invoice.dueDate)}
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
            <Button onClick={() => printInvoice(invoice)}>
              <Printer size={15} />
              Imprimir factura
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
      onSaved();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al registrar el pago'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 p-0 overflow-hidden sm:max-w-md">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <DialogTitle className="text-base font-semibold">Registrar pago</DialogTitle>
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
              <input type="date" className={NUM_CLS} value={date} onChange={(e) => setDate(e.target.value)} required />
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
              {mutation.isPending ? 'Registrando...' : 'Confirmar pago'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Pay installment modal ──────────────────────────────────────────────────────

function PayInstallmentModal({
  installment,
  saleOrderId,
  open,
  onOpenChange,
  onSaved,
}: {
  installment: Installment;
  saleOrderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 p-0 overflow-hidden sm:max-w-md">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <DialogTitle className="text-base font-semibold">
              Pagar cuota #{installment.number}
            </DialogTitle>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              Vence: {formatDate(installment.dueDate)} · Saldo: {formatPrice(remaining)}
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
              <input type="date" className={NUM_CLS} value={date} onChange={(e) => setDate(e.target.value)} required />
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
              {mutation.isPending ? 'Registrando...' : 'Confirmar pago'}
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
  const [payingInstallment, setPayingInstallment] = useState<Installment | null>(null);
  const [instModalOpen, setInstModalOpen] = useState(false);

  const { data: loan, isLoading, error } = useQuery<Loan>({
    queryKey: ['loan-by-order', saleOrderId],
    queryFn: () => financeApi.getLoanByOrder(saleOrderId),
    retry: false,
  });

  function openInstModal(inst: Installment) {
    setPayingInstallment(inst);
    setInstModalOpen(true);
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
  const creditPct            = totalCredit > 0 ? (paidFromInstallments / totalCredit) * 100 : 0;

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
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cobrado</span>
          <span className="font-medium text-emerald-600">{formatPrice(paidFromInstallments)}</span>
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

      <div className="space-y-1.5">
        {loan.installments.map((inst) => {
          const remaining = Number(inst.amount) - Number(inst.paidAmount);
          const isPayable =
            (inst.status === 'PENDING' || inst.status === 'PARTIAL' || inst.status === 'OVERDUE') &&
            remaining > 0;
          return (
            <div
              key={inst.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 w-5 text-xs font-mono text-muted-foreground/60">#{inst.number}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <InstallmentStatusBadge status={inst.status} />
                    <span className="text-xs text-muted-foreground/60">{formatDate(inst.dueDate)}</span>
                  </div>
                  <p className="font-medium text-foreground mt-0.5">
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
                <Button size="sm" className="ml-2 shrink-0" onClick={() => openInstModal(inst)}>
                  Pagar
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <a
        href="/dashboard/finance"
        className="flex items-center justify-center gap-1.5 rounded-3xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/20 transition-colors"
      >
        Ver en módulo de Finanzas
        <ChevronRight size={13} />
      </a>

      {payingInstallment && (
        <PayInstallmentModal
          installment={payingInstallment}
          saleOrderId={saleOrderId}
          open={instModalOpen}
          onOpenChange={(open) => { if (!open) setInstModalOpen(false); }}
          onSaved={() => {
            setInstModalOpen(false);
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
              <ARStatusBadge status={ar.status} />
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
                    {formatDate(ar.invoice.issuedAt)}
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
                  <p className="text-xs text-muted-foreground/60 mt-2">Vencimiento: {formatDate(ar.dueDate)}</p>
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
                        <span className="text-xs text-muted-foreground">{formatDate(pr.paymentDate)}</span>
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
                <Button className="w-full" onClick={() => setShowRegister(true)}>
                  Registrar pago
                </Button>
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

  const monthLabel  = MES_LARGO[now.getMonth()] + ' ' + now.getFullYear();
  const totalPct    = data && data.total > 0 ? Math.round((data.cash.total / data.total) * 100) : 0;
  const methodEntries = data ? Object.entries(data.byMethod).sort(([, a], [, b]) => b - a) : [];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Recaudaciones</p>
          <p className="text-sm text-muted-foreground">{monthLabel}</p>
        </div>
        {!isLoading && data && (
          <p className="text-xl font-bold text-foreground">{formatPrice(data.total)}</p>
        )}
        {isLoading && <div className="h-5 w-32 animate-pulse rounded bg-muted/30" />}
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
                  <span className="text-muted-foreground">{METHOD_SHORT[method] ?? method}</span>
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
        <p className="text-center text-xs text-muted-foreground/60 py-2">Sin recaudaciones registradas este mes</p>
      )}
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [statusFilter, setStatusFilter] = useState<'' | ARStatus>('');
  const [typeFilter, setTypeFilter]     = useState<'' | 'CASH' | 'CREDIT'>('');
  const [panelAR, setPanelAR]           = useState<AccountsReceivable | null>(null);
  const [panelOpen, setPanelOpen]       = useState(false);

  const { data: arList = [], isLoading } = useQuery({
    queryKey: ['accounts-receivable'],
    queryFn: paymentsApi.listAR,
  });

  const filtered = arList.filter((ar) => {
    if (statusFilter && ar.status !== statusFilter) return false;
    if (typeFilter && ar.invoice.saleOrder.saleType !== typeFilter) return false;
    return true;
  });

  function openPanel(ar: AccountsReceivable) { setPanelAR(ar); setPanelOpen(true); }
  function closePanel(open: boolean) { if (!open) setPanelOpen(false); }

  const totalPending = arList
    .filter((ar) => ar.status === 'PENDING' || ar.status === 'PARTIAL')
    .reduce((sum, ar) => {
      const isCredit = ar.invoice.saleOrder.saleType === 'CREDIT';
      const paid  = isCredit && ar.invoice.saleOrder.loan
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
          <h1 className="text-2xl font-semibold text-foreground">Pagos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cuentas por cobrar y registro de pagos</p>
        </div>
        {totalPending > 0 && (
          <div className="rounded-xl bg-warn-subtle border border-warn px-4 py-2 text-right">
            <p className="text-xs text-warn font-medium">Total pendiente</p>
            <p className="text-lg font-bold text-warn">{formatPrice(totalPending)}</p>
          </div>
        )}
      </div>

      <div className="mb-6">
        <CollectionsWidget />
      </div>

      <div className="mb-4 flex gap-3">
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v as ARStatus)}>
          <SelectTrigger>
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {statusFilter ? AR_STATUS_LABELS[statusFilter] : 'Todos los estados'}
            </span>
          </SelectTrigger>
          <SelectContent className="w-auto min-w-[9rem]">
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="PENDING">Pendiente</SelectItem>
            <SelectItem value="PARTIAL">Parcial</SelectItem>
            <SelectItem value="PAID">Pagado</SelectItem>
            <SelectItem value="CANCELLED">Cancelado</SelectItem>
          </SelectContent>
        </Select>
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
                      onClick={() => openPanel(ar)}
                      className="cursor-pointer hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(ar.dueDate)}</td>
                      <td className="px-4 py-3"><ARStatusBadge status={ar.status} /></td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {formatPrice(effectiveTotal)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600">
                        {formatPrice(effectivePaid)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
                        {formatPrice(pending)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {panelAR && (
        <ARDetailPanel ar={panelAR} open={panelOpen} onOpenChange={closePanel} />
      )}
    </div>
  );
}
