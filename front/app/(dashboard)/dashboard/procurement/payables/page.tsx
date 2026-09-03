'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NumericInput } from '../../../../../components/numeric-input';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  payablesApi,
  type AccountsPayable,
  type APStatus,
  type RegisterSupplierPaymentPayload,
} from '../../../../../lib/api/payables';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../../../../../lib/api/payments';
import { apUrgency, type ApUrgency, type ApUrgencyLevel } from '../../../../../lib/ap-urgency';
import { formatDatePY } from '../../../../../lib/date';
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

const AP_STATUS_LABELS: Record<APStatus, string> = {
  PENDING: 'Pendiente', PARTIAL: 'Parcial', PAID: 'Pagado', CANCELLED: 'Cancelado',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(n);
}

function receiptRef(ap: AccountsPayable['purchaseReceipt']) {
  return `Recepción #${ap.receiptNumber}`;
}

type RowAccent = 'destructive' | 'warn' | null;

function accentFor(level: ApUrgencyLevel): RowAccent {
  if (level === 'overdue') return 'destructive';
  if (level === 'pending') return 'warn';
  return null;
}

const ACCENT_BORDER: Record<Exclude<RowAccent, null>, string> = {
  destructive: 'border-l-destructive',
  warn: 'border-l-warn',
};

// ── Status badge ───────────────────────────────────────────────────────────────

const AP_STATUS_CLASS: Partial<Record<APStatus, string>> = {
  PENDING: 'bg-warn-subtle text-warn border-warn/30',
  PARTIAL: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  PAID:    'bg-accent-subtle text-accent-on border-accent-on/20',
};

function APStatusBadge({ status, urgency }: { status: APStatus; urgency?: ApUrgency }) {
  if (urgency?.level === 'overdue') {
    return (
      <Badge variant="destructive" className="gap-1 whitespace-nowrap">
        <AlertTriangle size={10} />
        Vencida · {urgency.days} {urgency.days === 1 ? 'día' : 'días'}
      </Badge>
    );
  }
  return (
    <Badge variant={status === 'CANCELLED' ? 'destructive' : 'outline'} className={AP_STATUS_CLASS[status]}>
      {AP_STATUS_LABELS[status]}
    </Badge>
  );
}

// ── Register payment modal ─────────────────────────────────────────────────────

function RegisterPaymentModal({
  ap,
  open,
  onOpenChange,
  onSaved,
}: {
  ap: AccountsPayable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const remaining = Number(ap.amount) - Number(ap.paidAmount);

  const [amount, setAmount] = useState<number>(Math.round(remaining));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const dto: RegisterSupplierPaymentPayload = {
        amount,
        paymentMethod: method,
        paymentDate: date,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      return payablesApi.registerPayment(ap.id, dto);
    },
    onSuccess: () => onSaved(),
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
              {ap.supplier.name} · Saldo: {formatPrice(remaining)}
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
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° transferencia, cheque..." />
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

// ── AP detail panel ────────────────────────────────────────────────────────────

function APDetailPanel({
  ap,
  open,
  onOpenChange,
}: {
  ap: AccountsPayable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [showRegister, setShowRegister] = useState(false);
  const queryClient = useQueryClient();

  const urgency   = apUrgency(ap);
  const remaining = Number(ap.amount) - Number(ap.paidAmount);
  const pct       = Number(ap.amount) > 0 ? (Number(ap.paidAmount) / Number(ap.amount)) * 100 : 0;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full max-w-sm flex-col p-0 sm:max-w-sm" showCloseButton>
          <SheetHeader className="border-b border-border px-5 py-4 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <SheetTitle>{ap.supplier.name}</SheetTitle>
              <APStatusBadge status={ap.status} urgency={urgency} />
            </div>
            {ap.supplier.email && <SheetDescription>{ap.supplier.email}</SheetDescription>}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="border-b border-border px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Recepción</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{receiptRef(ap.purchaseReceipt)}</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">{formatDatePY(ap.purchaseReceipt.receivedAt, 'local')}</p>
                </div>
                <Link
                  href={`/dashboard/procurement`}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Ver orden de compra
                </Link>
              </div>
            </div>

            <div className="border-b border-border px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Saldo</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total recepción</span>
                  <span className="font-medium text-foreground">{formatPrice(Number(ap.amount))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pagado</span>
                  <span className="font-medium text-emerald-600">{formatPrice(Number(ap.paidAmount))}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted/30">
                  <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="font-semibold text-muted-foreground">Saldo pendiente</span>
                  <span className="font-bold text-foreground">{formatPrice(remaining)}</span>
                </div>
              </div>
              {ap.dueDate && (
                <p className={cn('text-xs mt-2', urgency.level === 'overdue' ? 'font-medium text-destructive' : 'text-muted-foreground/60')}>
                  Vencimiento: {formatDatePY(ap.dueDate, 'utc')}
                  {urgency.level === 'overdue' && ` · ${urgency.days} ${urgency.days === 1 ? 'día' : 'días'} de mora`}
                </p>
              )}
            </div>

            {ap.supplierPayments.length > 0 && (
              <div className="border-b border-border px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Historial de pagos</p>
                <div className="space-y-2">
                  {ap.supplierPayments.map((sp) => (
                    <div key={sp.id} className="rounded-lg bg-muted/30 px-3 py-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-foreground">{formatPrice(Number(sp.amount))}</span>
                        <span className="text-xs text-muted-foreground">{formatDatePY(sp.paymentDate, 'utc')}</span>
                      </div>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        {PAYMENT_METHOD_LABELS[sp.paymentMethod]}
                        {sp.reference ? ` · ${sp.reference}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(ap.status === 'PENDING' || ap.status === 'PARTIAL') && (
              <div className="px-5 py-4">
                <Button className="w-full" onClick={() => setShowRegister(true)}>
                  Registrar pago
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <RegisterPaymentModal
        ap={ap}
        open={showRegister}
        onOpenChange={(open) => { if (!open) setShowRegister(false); }}
        onSaved={() => {
          setShowRegister(false);
          void queryClient.invalidateQueries({ queryKey: ['accounts-payable'] });
          onOpenChange(false);
        }}
      />
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PayablesPage() {
  const [statusFilter, setStatusFilter] = useState<'' | APStatus>('');
  const [panelAP, setPanelAP] = useState<AccountsPayable | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const { data: apList = [], isLoading } = useQuery({
    queryKey: ['accounts-payable'],
    queryFn: payablesApi.listAP,
  });

  const filtered = apList.filter((ap) => !statusFilter || ap.status === statusFilter);

  function openPanel(ap: AccountsPayable) { setPanelAP(ap); setPanelOpen(true); }

  const totalPending = apList
    .filter((ap) => ap.status === 'PENDING' || ap.status === 'PARTIAL')
    .reduce((sum, ap) => sum + (Number(ap.amount) - Number(ap.paidAmount)), 0);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Cuentas por pagar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cuentas por pagar a proveedores</p>
        </div>
        {totalPending > 0 && (
          <div className="rounded-xl bg-warn-subtle border border-warn px-4 py-2 text-right">
            <p className="text-xs text-warn font-medium">Total pendiente</p>
            <p className="text-lg font-bold text-warn">{formatPrice(totalPending)}</p>
          </div>
        )}
      </div>

      <div className="mb-4">
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v as APStatus)}>
          <SelectTrigger>
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {statusFilter ? AP_STATUS_LABELS[statusFilter] : 'Todos los estados'}
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
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando cuentas por pagar...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground/60">
            {apList.length === 0
              ? 'Las cuentas por pagar se generan automáticamente al recibir mercadería de una orden de compra.'
              : 'No se encontraron cuentas con los filtros aplicados.'}
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Proveedor</th>
                  <th className="px-4 py-3 text-left">Recepción</th>
                  <th className="px-4 py-3 text-left">Vencimiento</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Pagado</th>
                  <th className="px-4 py-3 text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((ap) => {
                  const urgency = apUrgency(ap);
                  const accent = accentFor(urgency.level);
                  const pending = Number(ap.amount) - Number(ap.paidAmount);
                  return (
                    <tr key={ap.id} onClick={() => openPanel(ap)} className="cursor-pointer hover:bg-muted/20 transition-colors">
                      <td className={cn('px-4 py-3', accent && cn('border-l-[3px]', ACCENT_BORDER[accent]))}>
                        <div className="font-medium text-foreground">{ap.supplier.name}</div>
                        {ap.supplier.contactName && (
                          <div className="text-xs text-muted-foreground/60">{ap.supplier.contactName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">{receiptRef(ap.purchaseReceipt)}</span>
                      </td>
                      <td className={cn('px-4 py-3', accent === 'destructive' ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                        {formatDatePY(ap.dueDate, 'utc')}
                      </td>
                      <td className="px-4 py-3"><APStatusBadge status={ap.status} urgency={urgency} /></td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">{formatPrice(Number(ap.amount))}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatPrice(Number(ap.paidAmount))}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-foreground">{formatPrice(pending)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {panelAP && <APDetailPanel ap={panelAP} open={panelOpen} onOpenChange={setPanelOpen} />}
    </div>
  );
}
