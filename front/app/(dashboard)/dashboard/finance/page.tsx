'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { financeApi, Loan, Installment } from '../../../../lib/api/finance';
import { NumericInput } from '../../../../components/numeric-input';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(v: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(v);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const LOAN_STATUS_MAP: Record<string, { label: string; className: string }> = {
  ACTIVE:    { label: 'Activo',    className: 'bg-sky-50 text-sky-700' },
  PAID:      { label: 'Pagado',    className: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'Cancelado', className: 'bg-zinc-100 text-zinc-500' },
};

const INST_STATUS_MAP: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'bg-zinc-100 text-zinc-600' },
  PARTIAL: { label: 'Parcial',   className: 'bg-amber-50 text-amber-700' },
  PAID:    { label: 'Pagado',    className: 'bg-emerald-50 text-emerald-700' },
  OVERDUE: { label: 'Vencido',   className: 'bg-red-50 text-red-700' },
};

function StatusBadge({ map, status }: { map: Record<string, { label: string; className: string }>; status: string }) {
  const s = map[status] ?? { label: status, className: 'bg-zinc-100 text-zinc-500' };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
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
  const remaining = installment.amount - installment.paidAmount;
  const [amount, setAmount] = useState<number>(remaining);
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      financeApi.payInstallment(installment.id, { amount: amount, notes: notes || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance-loans'] });
      onDone();
    },
  });

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-2 px-4 py-3 space-y-3">
      <p className="text-xs font-semibold text-ink">
        Registrar pago — Cuota {installment.number}
        <span className="ml-2 font-normal text-faint">
          Saldo: {formatPrice(remaining)}
        </span>
      </p>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-muted mb-1">Monto</label>
          <NumericInput
            value={amount}
            onChange={setAmount}
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-muted mb-1">Nota (opcional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !amount || Number(amount) <= 0}
          className="flex-1 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-canvas hover:opacity-80 disabled:opacity-50"
        >
          {mutation.isPending ? 'Registrando...' : 'Confirmar pago'}
        </button>
        <button
          onClick={onDone}
          className="flex-1 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2"
        >
          Cancelar
        </button>
      </div>
      {mutation.isError && (
        <p className="text-xs text-red-600">
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

  return (
    <div>
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-surface-2">
        <span className="w-6 text-xs text-faint text-center">{inst.number}</span>
        <span className="flex-1 text-xs text-muted">{formatDate(inst.dueDate)}</span>
        <span className="text-xs text-ink font-mono tabular-nums">{formatPrice(inst.amount)}</span>
        {inst.paidAmount > 0 && (
          <span className="text-xs text-emerald-600 font-mono tabular-nums">
            −{formatPrice(inst.paidAmount)}
          </span>
        )}
        <StatusBadge map={INST_STATUS_MAP} status={inst.status} />
        {canPay && (
          <button
            onClick={() => setPaying((v) => !v)}
            className="rounded px-2 py-0.5 text-xs font-medium bg-ink text-canvas hover:opacity-80"
          >
            Pagar
          </button>
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

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface hover:bg-surface-2 text-left"
      >
        {open ? <ChevronDown size={14} className="text-faint shrink-0" /> : <ChevronRight size={14} className="text-faint shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">
            {loan.customer.firstName} {loan.customer.lastName}
          </p>
          <p className="text-xs text-faint mt-0.5">
            {loan.totalInstallments} cuotas · {loan.interestRate}% interés · {formatDate(loan.createdAt)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-ink tabular-nums">{formatPrice(loan.totalAmount)}</p>
          <p className="text-xs text-faint">Capital: {formatPrice(loan.principal)}</p>
        </div>
        <div className="ml-2">
          <StatusBadge map={LOAN_STATUS_MAP} status={loan.status} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-surface px-4 py-3 space-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-2">Cuotas</p>
          {loan.installments.map((inst) => (
            <InstallmentRow key={inst.id} inst={inst} />
          ))}
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
      <div className="p-8 text-sm text-muted">Cargando préstamos...</div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-red-600">
        <AlertCircle size={16} />
        Error al cargar préstamos.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-ink">Financiación</h1>
        <p className="text-sm text-muted mt-0.5">Préstamos y cuotas de ventas a crédito</p>
      </div>

      {overdueInstallments.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700 mb-1">
            {overdueInstallments.length} cuota{overdueInstallments.length > 1 ? 's' : ''} vencida{overdueInstallments.length > 1 ? 's' : ''}
          </p>
          <div className="space-y-0.5">
            {overdueInstallments.map((inst) => (
              <p key={inst.id} className="text-xs text-red-600">
                {inst.loan.customer.firstName} {inst.loan.customer.lastName} — cuota {inst.number}, vence {formatDate(inst.dueDate)} ({formatPrice(inst.amount - inst.paidAmount)} pendiente)
              </p>
            ))}
          </div>
        </div>
      )}

      {loans.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">No hay préstamos registrados.</p>
          <p className="text-xs text-faint mt-1">Se crean automáticamente al aprobar una venta a crédito.</p>
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
