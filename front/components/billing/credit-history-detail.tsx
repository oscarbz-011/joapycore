'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Gavel } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api/api-error';
import {
  salesApi,
  type CreditHistory,
  type InstallmentStatus,
  type LoanSummary,
} from '@/lib/api/sales';
import {
  SCORE_LABELS,
  formatDelay,
  historyTotals,
  scoreStyle,
} from '@/lib/credit-score';
import { formatDatePY } from '@/lib/date';
import { cn } from '@/lib/utils';

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(n);
}

const INSTALLMENT_STATUS: Record<InstallmentStatus, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
};

// ── Resumen destacado de la evaluación ─────────────────────────────────────────

function Kpi({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warn' | 'danger';
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-lg font-bold tabular-nums',
          tone === 'danger'
            ? 'text-destructive'
            : tone === 'warn'
              ? 'text-warn'
              : 'text-foreground',
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Calificación en grande + los números que deciden la aprobación. */
export function CreditSummary({ history }: { history: CreditHistory }) {
  const totals = historyTotals(history);
  const average = history.averageDelayDays;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl px-4 py-3',
          scoreStyle(history.score),
        )}
      >
        <span className="text-4xl font-extrabold leading-none tabular-nums">
          {history.score ?? '—'}
        </span>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            Calificación del cliente
          </p>
          <p className="text-base font-semibold leading-tight">
            {history.score === null
              ? 'Sin historial'
              : SCORE_LABELS[history.score]}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Kpi
          label="Atraso promedio"
          value={formatDelay(average)}
          hint={
            totals.maxDelayDays > 0
              ? `Máximo ${formatDelay(totals.maxDelayDays)}`
              : undefined
          }
          tone={average !== null && average > 0 ? 'warn' : 'default'}
        />
        <Kpi
          label="Cuotas vencidas"
          value={String(history.overdueCount)}
          hint={
            history.overdueCount > 0
              ? formatPrice(history.overdueAmount)
              : 'Ninguna hoy'
          }
          tone={history.overdueCount > 0 ? 'danger' : 'default'}
        />
        <Kpi
          label="Saldo adeudado"
          value={formatPrice(totals.outstanding)}
          hint={`${totals.activeCount} crédito${totals.activeCount === 1 ? '' : 's'} activo${totals.activeCount === 1 ? '' : 's'}`}
        />
        <Kpi
          label="Cuotas con atraso"
          value={String(totals.lateInstallments)}
          hint={`${totals.finishedCount} crédito${totals.finishedCount === 1 ? '' : 's'} culminado${totals.finishedCount === 1 ? '' : 's'}`}
          tone={totals.lateInstallments > 0 ? 'warn' : 'default'}
        />
      </div>
    </div>
  );
}

// ── Marca de incobrable/judicial ───────────────────────────────────────────────

export function UncollectibleControls({
  customerId,
  history,
  onChanged,
}: {
  customerId: string;
  history: CreditHistory;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { manual, automatic } = history.uncollectible;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
    void queryClient.invalidateQueries({ queryKey: ['sale-customers'] });
    onChanged();
  };
  const mark = useMutation({
    mutationFn: () => salesApi.markCustomerUncollectible(customerId, reason.trim()),
    onSuccess: () => {
      setOpen(false);
      setReason('');
      refresh();
    },
  });
  const clear = useMutation({
    mutationFn: () => salesApi.clearCustomerUncollectible(customerId),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-2">
      {automatic && (
        <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
          <Gavel size={13} className="mt-0.5 shrink-0" />
          Tiene una cuota impaga que supera los días de atraso configurados
          para incobrable/judicial. No puede recibir un crédito nuevo hasta
          regularizarla.
        </p>
      )}

      {manual ? (
        <div className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
          <p className="flex items-start gap-1.5">
            <Gavel size={13} className="mt-0.5 shrink-0" />
            <span>
              Marcado como incobrable/judicial el{' '}
              {formatDatePY(manual.markedAt, 'local')}
              {manual.reason ? `: ${manual.reason}` : ''}. No puede recibir un
              crédito nuevo.
            </span>
          </p>
          <Button
            variant="outline"
            size="xs"
            className="mt-2"
            disabled={clear.isPending}
            onClick={() => clear.mutate()}
          >
            {clear.isPending ? 'Quitando...' : 'Quitar marca'}
          </Button>
          {clear.isError && (
            <p role="alert" className="mt-1">
              {apiErrorMessage(clear.error, 'No se pudo quitar la marca')}
            </p>
          )}
        </div>
      ) : (
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <Gavel />
          Marcar como incobrable/judicial
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como incobrable/judicial</DialogTitle>
            <DialogDescription>
              El cliente pasa a calificación 6 y no se le podrá aprobar un
              crédito nuevo hasta que se quite la marca.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="uncollectible-reason">Motivo *</Label>
            <Textarea
              id="uncollectible-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ej: deuda derivada a gestión judicial"
            />
          </div>
          {mark.isError && (
            <p role="alert" className="text-xs text-destructive">
              {apiErrorMessage(mark.error, 'No se pudo marcar al cliente')}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || mark.isPending}
              onClick={() => mark.mutate()}
            >
              {mark.isPending ? 'Marcando...' : 'Marcar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Créditos activos y culminados ──────────────────────────────────────────────

function LoanRow({ loan }: { loan: LoanSummary }) {
  const [open, setOpen] = useState(false);
  const late = (loan.averageDelayDays ?? 0) > 0;

  return (
    <div className="rounded-lg border border-border/60 text-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:grid-cols-[auto_minmax(0,1fr)_7rem_4.5rem_6.5rem]"
      >
        {open ? (
          <ChevronDown size={14} className="text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground" />
        )}
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground">
            {loan.productNames.join(', ')}
          </span>
          <span className="block truncate text-muted-foreground">
            {loan.invoiceNumber
              ? `Factura ${loan.invoiceNumber}`
              : 'Sin factura emitida'}{' '}
            · {formatDatePY(loan.startDate, 'local')}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Adeudado
          </span>
          <span
            className={cn(
              'block tabular-nums',
              loan.outstandingBalance > 0
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground',
            )}
          >
            {formatPrice(loan.outstandingBalance)}
          </span>
        </span>
        <span className="hidden text-right sm:block">
          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Cuotas
          </span>
          <span className="block tabular-nums text-foreground">
            {loan.installmentsPaid}/{loan.totalInstallments}
          </span>
        </span>
        <span className="hidden text-right sm:block">
          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Atraso prom.
          </span>
          <span
            className={cn(
              'block font-medium',
              late ? 'text-warn' : 'text-foreground',
            )}
          >
            {formatDelay(loan.averageDelayDays)}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-border/60 px-3 py-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground/70">Total del crédito</dt>
              <dd className="tabular-nums text-foreground">
                {formatPrice(loan.totalAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground/70">Pagado</dt>
              <dd className="tabular-nums text-foreground">
                {formatPrice(loan.paidAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground/70">Cuota mensual</dt>
              <dd className="tabular-nums text-foreground">
                {formatPrice(loan.monthlyInstallment)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground/70">Atraso máximo</dt>
              <dd className="text-foreground">
                {loan.averageDelayDays === null
                  ? '—'
                  : formatDelay(loan.maxDelayDays)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground/70">Cuotas con atraso</dt>
              <dd className="tabular-nums text-foreground">
                {loan.lateInstallments}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground/70">Primera cuota</dt>
              <dd className="text-foreground">
                {loan.firstDueDate ? formatDatePY(loan.firstDueDate) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground/70">Última cuota</dt>
              <dd className="text-foreground">
                {loan.finalDueDate ? formatDatePY(loan.finalDueDate) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground/70">Próximo vencimiento</dt>
              <dd className="text-foreground">
                {loan.nextDueDate ? formatDatePY(loan.nextDueDate) : '—'}
              </dd>
            </div>
          </dl>

          {loan.invoiceId && (
            <Link
              href={`/dashboard/billing/invoices/${loan.invoiceId}`}
              className="mt-2 inline-block text-primary hover:underline"
            >
              Ver factura {loan.invoiceNumber ?? ''}
            </Link>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-left text-muted-foreground/70">
                <tr>
                  <th className="py-1 pr-2 font-medium">N°</th>
                  <th className="py-1 pr-2 font-medium">Vence</th>
                  <th className="py-1 pr-2 font-medium">Pagó</th>
                  <th className="py-1 pr-2 font-medium">Atraso</th>
                  <th className="py-1 pr-2 text-right font-medium">Pagado</th>
                  <th className="py-1 pr-2 text-right font-medium">Saldo</th>
                  <th className="py-1 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loan.installments.map((installment) => (
                  <tr key={installment.number}>
                    <td className="py-1 pr-2 tabular-nums">
                      {installment.number}
                    </td>
                    <td className="py-1 pr-2 whitespace-nowrap">
                      {formatDatePY(installment.dueDate)}
                    </td>
                    <td className="py-1 pr-2 whitespace-nowrap">
                      {installment.paidAt
                        ? formatDatePY(installment.paidAt, 'local')
                        : '—'}
                    </td>
                    <td
                      className={cn(
                        'py-1 pr-2 whitespace-nowrap',
                        (installment.delayDays ?? 0) > 0 && 'text-destructive',
                      )}
                    >
                      {formatDelay(installment.delayDays)}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {formatPrice(installment.paidAmount)}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {formatPrice(installment.balance)}
                    </td>
                    <td
                      className={cn(
                        'py-1',
                        installment.status === 'OVERDUE' && 'text-destructive',
                      )}
                    >
                      {INSTALLMENT_STATUS[installment.status]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function LoanHistoryTabs({ history }: { history: CreditHistory }) {
  const [tab, setTab] = useState<'active' | 'finished'>(
    history.activeLoans.length === 0 && history.finishedLoans.length > 0
      ? 'finished'
      : 'active',
  );
  const tabs = [
    { key: 'active' as const, label: 'Activos', loans: history.activeLoans },
    {
      key: 'finished' as const,
      label: 'Culminados',
      loans: history.finishedLoans,
    },
  ];
  const current = tabs.find((item) => item.key === tab)!;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Créditos del cliente" className="flex gap-1">
          {tabs.map((item) => (
            <Button
              key={item.key}
              role="tab"
              aria-selected={tab === item.key}
              variant={tab === item.key ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setTab(item.key)}
            >
              {item.label} ({item.loans.length})
            </Button>
          ))}
        </div>
      </div>

      {current.loans.length === 0 ? (
        <p className="text-xs text-muted-foreground/60">
          {tab === 'active'
            ? 'No tiene créditos activos.'
            : 'No tiene créditos culminados.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {current.loans.map((loan) => (
            <LoanRow key={loan.loanId} loan={loan} />
          ))}
        </div>
      )}
    </div>
  );
}
