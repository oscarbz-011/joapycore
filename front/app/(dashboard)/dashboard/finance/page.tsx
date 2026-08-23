'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, AlertCircle, AlertTriangle } from 'lucide-react';
import { financeApi, Loan, Installment } from '../../../../lib/api/finance';
import { openPdf } from '../../../../lib/open-pdf';
import { daysOverdue } from '../../../../lib/overdue';
import { ContractCard } from '../../../../components/contract-card';
import { NumericInput } from '../../../../components/numeric-input';
import { ReceiptButton } from '../../../../components/receipt-button';
import { RequirePermission } from '../../../../components/require-permission';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(v: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(v);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

const PAY_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CHECK: 'Cheque',
  MOBILE: 'Billetera móvil',
  OTHER: 'Otro',
};

// ── Status badges ──────────────────────────────────────────────────────────────

const LOAN_STATUS_LABEL: Record<string, string> = {
  ACTIVE:    'Activo',
  PAID:      'Pagado',
  CANCELLED: 'Cancelado',
};

const LOAN_STATUS_CLASS: Record<string, string> = {
  ACTIVE:    'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  PAID:      'bg-accent-subtle text-accent-on border-accent-on/20',
  CANCELLED: 'bg-muted text-muted-foreground border-border',
};

function LoanStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={LOAN_STATUS_CLASS[status] ?? 'bg-muted text-muted-foreground border-border'}>
      {LOAN_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

const INST_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID:    'Pagado',
  OVERDUE: 'Vencido',
};

const INST_STATUS_CLASS: Record<string, string> = {
  PENDING: 'bg-warn-subtle text-warn border-warn/30',
  PARTIAL: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  PAID:    'bg-accent-subtle text-accent-on border-accent-on/20',
  OVERDUE: 'bg-destructive/10 text-destructive border-destructive/30',
};

function InstStatusBadge({ status, overdueDays }: { status: string; overdueDays?: number }) {
  if (status === 'OVERDUE' && overdueDays && overdueDays > 0) {
    return (
      <Badge variant="destructive" className="gap-1 whitespace-nowrap">
        <AlertTriangle size={10} />
        Vencido · {overdueDays} {overdueDays === 1 ? 'día' : 'días'}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={INST_STATUS_CLASS[status] ?? 'bg-muted text-muted-foreground border-border'}>
      {INST_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

// ── PayInstallmentForm ─────────────────────────────────────────────────────────

function PayInstallmentForm({
  installment,
  onDone,
}: {
  installment: Installment;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  // Math.ceil aligns with the backend ceiling so a full payment is correctly marked PAID
  const remaining = Math.ceil(Number(installment.amount)) - Number(installment.paidAmount);
  const [amount, setAmount] = useState<number>(remaining);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      financeApi.payInstallment(installment.id, { amount, paymentMethod, paymentDate, notes: notes || undefined }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['finance-loans'] });
      if (data.receipt?.pdfFileId) void openPdf(data.receipt.pdfFileId);
      onDone();
    },
  });

  return (
    <div className="mt-2 rounded-xl border border-border bg-muted/20 px-4 py-3 space-y-3">
      <p className="text-xs font-semibold text-foreground">
        Registrar pago — Cuota {installment.number}
        <span className="ml-2 font-normal text-muted-foreground/60">
          Saldo: {formatPrice(remaining)}
        </span>
      </p>
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label>Monto</Label>
          <NumericInput value={amount} onChange={setAmount} className={NUM_CLS} />
        </div>
        <div className="flex-1 space-y-1">
          <Label>Método de pago</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="w-full">
              <span className="flex-1 text-left text-sm truncate">{PAY_LABELS[paymentMethod] ?? paymentMethod}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">Efectivo</SelectItem>
              <SelectItem value="BANK_TRANSFER">Transferencia</SelectItem>
              <SelectItem value="CHECK">Cheque</SelectItem>
              <SelectItem value="MOBILE">Billetera móvil</SelectItem>
              <SelectItem value="OTHER">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <Label>Fecha de pago</Label>
          <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label>Nota (opcional)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !amount || Number(amount) <= 0}
          className="flex-1"
          size="sm"
        >
          {mutation.isPending ? 'Registrando...' : 'Confirmar pago'}
        </Button>
        <Button variant="outline" onClick={onDone} className="flex-1" size="sm">
          Cancelar
        </Button>
      </div>
      {mutation.isError && (
        <p className="text-xs text-destructive">
          {(mutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar pago'}
        </p>
      )}
    </div>
  );
}

// ── InstallmentRow ─────────────────────────────────────────────────────────────

function InstallmentRow({ inst }: { inst: Installment }) {
  const [paying, setPaying] = useState(false);
  const canPay = inst.status === 'PENDING' || inst.status === 'PARTIAL' || inst.status === 'OVERDUE';
  const overdueDays = inst.status === 'OVERDUE' ? Math.max(0, daysOverdue(inst.dueDate)) : 0;
  // Mismo diseño de resaltado (barra + texto coloreado) para "Vencido"
  // (rojo) y "Pendiente" (ámbar) — ver el mismo criterio en payments/page.tsx.
  const accent = overdueDays > 0 ? 'destructive' : inst.status === 'PENDING' ? 'warn' : null;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/20',
          accent === 'destructive' && 'border-l-[3px] border-l-destructive',
          accent === 'warn' && 'border-l-[3px] border-l-warn',
        )}
      >
        <span className="w-6 text-xs text-muted-foreground/60 text-center">{inst.number}</span>
        <span
          className={cn(
            'flex-1 text-xs',
            accent === 'destructive' && 'font-medium text-destructive',
            accent === 'warn' && 'font-medium text-warn',
            !accent && 'text-muted-foreground',
          )}
        >
          {formatDate(inst.dueDate)}
          {inst.status === 'PAID' && inst.paymentDate && (
            <span className="ml-1.5 text-emerald-600">· pagada {formatDate(inst.paymentDate)}</span>
          )}
        </span>
        <span className="text-xs text-foreground font-mono tabular-nums">{formatPrice(Math.ceil(Number(inst.amount)))}</span>
        {Number(inst.paidAmount) > 0 && (
          <span className="text-xs text-emerald-600 font-mono tabular-nums">
            −{formatPrice(Number(inst.paidAmount))}
          </span>
        )}
        <InstStatusBadge status={inst.status} overdueDays={overdueDays} />
        {Number(inst.paidAmount) > 0 && <ReceiptButton installmentId={inst.id} />}
        {canPay && (
          <RequirePermission permission="finance:installments:pay">
            <Button size="sm" onClick={() => setPaying((v) => !v)}>
              Pagar
            </Button>
          </RequirePermission>
        )}
      </div>
      {paying && (
        <PayInstallmentForm installment={inst} onDone={() => setPaying(false)} />
      )}
    </div>
  );
}

// ── LoanRow ────────────────────────────────────────────────────────────────────

function LoanRow({ loan }: { loan: Loan }) {
  const [open, setOpen] = useState(false);
  const productSummary = loan.saleOrder.items
    .map((i) => i.product?.name ?? i.description ?? 'Ítem')
    .join(', ');
  const overdueCount = loan.installments.filter((i) => i.status === 'OVERDUE').length;
  const pendingCount = loan.installments.filter((i) => i.status === 'PENDING').length;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/20 text-left transition-colors',
          overdueCount > 0 && 'border-l-[3px] border-l-destructive',
          overdueCount === 0 && pendingCount > 0 && 'border-l-[3px] border-l-warn',
        )}
      >
        {open
          ? <ChevronDown size={14} className="text-muted-foreground/60 shrink-0" />
          : <ChevronRight size={14} className="text-muted-foreground/60 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {loan.customer.firstName} {loan.customer.lastName}
          </p>
          {productSummary && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{productSummary}</p>
          )}
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            {loan.totalInstallments} cuotas · {loan.interestRate}% interés · {formatDate(loan.createdAt)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-foreground tabular-nums">{formatPrice(loan.totalAmount)}</p>
          <p className="text-xs text-muted-foreground/60">Capital: {formatPrice(loan.principal)}</p>
        </div>
        <div className="ml-2 flex items-center gap-1.5">
          {overdueCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle size={10} />
              {overdueCount} vencida{overdueCount !== 1 ? 's' : ''}
            </Badge>
          )}
          {pendingCount > 0 && (
            <Badge variant="outline" className="gap-1 bg-warn-subtle text-warn border-warn/30">
              {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
            </Badge>
          )}
          <LoanStatusBadge status={loan.status} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-card px-4 py-3 space-y-3">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Cuotas</p>
            {loan.installments.map((inst) => (
              <InstallmentRow key={inst.id} inst={inst} />
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Contrato</p>
            <ContractCard entityType="sale_order" entityId={loan.saleOrderId} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const { data: loans = [], isLoading, isError } = useQuery({
    queryKey: ['finance-loans'],
    queryFn: financeApi.listLoans,
  });

  const { data: overdueInstallments = [] } = useQuery({
    queryKey: ['finance-overdue'],
    queryFn: financeApi.getOverdueInstallments,
  });

  if (isLoading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Cargando préstamos...</div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-destructive">
        <AlertCircle size={16} />
        Error al cargar préstamos.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Financiación</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Préstamos y cuotas de ventas a crédito</p>
      </div>

      {overdueInstallments.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm font-semibold text-destructive mb-1">
            {overdueInstallments.length} cuota{overdueInstallments.length > 1 ? 's' : ''} vencida{overdueInstallments.length > 1 ? 's' : ''}
          </p>
          <div className="space-y-0.5">
            {overdueInstallments.map((inst) => {
              const days = Math.max(0, daysOverdue(inst.dueDate));
              return (
                <p key={inst.id} className="text-xs text-destructive">
                  {inst.loan.customer.firstName} {inst.loan.customer.lastName} — cuota {inst.number}, vence {formatDate(inst.dueDate)}
                  {' · '}{days} {days === 1 ? 'día' : 'días'} de mora ({formatPrice(Math.ceil(Number(inst.amount)) - Number(inst.paidAmount))} pendiente)
                </p>
              );
            })}
          </div>
        </div>
      )}

      {loans.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No hay préstamos registrados.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Se crean automáticamente al aprobar una venta a crédito.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => (
            <LoanRow key={loan.id} loan={loan} />
          ))}
        </div>
      )}
    </div>
  );
}
