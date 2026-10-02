'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Gavel } from 'lucide-react';

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
import { formatDelay, scoreLabel, scoreStyle } from '@/lib/credit-score';
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

// ── Calificación ───────────────────────────────────────────────────────────────

export function CreditScoreBadge({ history }: { history: CreditHistory }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
        scoreStyle(history.score),
      )}
    >
      {scoreLabel(history.score)}
    </span>
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

function LoanCard({ loan }: { loan: LoanSummary }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border/60 p-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 font-medium text-foreground">
          {loan.productNames.join(', ')}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatPrice(loan.totalAmount)}
        </span>
      </div>

      <div className="mt-0.5">
        {loan.invoiceId ? (
          <Link
            href={`/dashboard/billing/invoices/${loan.invoiceId}`}
            className="text-primary hover:underline"
          >
            Factura {loan.invoiceNumber ?? 'sin número'}
          </Link>
        ) : (
          <span className="text-muted-foreground/70">Sin factura emitida</span>
        )}
        <span className="text-muted-foreground/70">
          {' '}
          · Compra {formatDatePY(loan.startDate, 'local')}
        </span>
      </div>

      <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1">
        <div>
          <dt className="text-muted-foreground/70">Pagado</dt>
          <dd className="tabular-nums text-foreground">
            {formatPrice(loan.paidAmount)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground/70">Adeudado</dt>
          <dd
            className={cn(
              'tabular-nums',
              loan.outstandingBalance > 0
                ? 'font-medium text-foreground'
                : 'text-muted-foreground',
            )}
          >
            {formatPrice(loan.outstandingBalance)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground/70">Cuotas pagadas</dt>
          <dd className="tabular-nums text-foreground">
            {loan.installmentsPaid}/{loan.totalInstallments} ·{' '}
            {formatPrice(loan.monthlyInstallment)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground/70">Atraso promedio</dt>
          <dd className="text-foreground">
            {formatDelay(loan.averageDelayDays)}
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
      </dl>

      <p className="mt-1.5 text-muted-foreground/70">
        1ª cuota {loan.firstDueDate ? formatDatePY(loan.firstDueDate) : '—'} →
        última {loan.finalDueDate ? formatDatePY(loan.finalDueDate) : '—'}
        {loan.nextDueDate
          ? ` · Próx. vence ${formatDatePY(loan.nextDueDate)}`
          : ''}
      </p>

      <Button
        variant="ghost"
        size="xs"
        className="mt-1 -ml-2 text-muted-foreground"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronUp /> : <ChevronDown />}
        {open ? 'Ocultar cuotas' : 'Ver detalle de cuotas'}
      </Button>

      {open && (
        <div className="mt-1 overflow-x-auto">
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
        <p className="text-xs text-muted-foreground">
          Atraso promedio general:{' '}
          <span className="font-medium text-foreground">
            {formatDelay(history.averageDelayDays)}
          </span>
        </p>
      </div>

      {current.loans.length === 0 ? (
        <p className="text-xs text-muted-foreground/60">
          {tab === 'active'
            ? 'No tiene créditos activos.'
            : 'No tiene créditos culminados.'}
        </p>
      ) : (
        <div className="space-y-2">
          {current.loans.map((loan) => (
            <LoanCard key={loan.loanId} loan={loan} />
          ))}
        </div>
      )}
    </div>
  );
}
