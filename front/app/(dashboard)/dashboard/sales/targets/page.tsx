'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, ChevronLeft, ChevronRight, Pencil, Plus, Target, X } from 'lucide-react';
import { salesApi, type SellerStat } from '@/lib/api/sales';
import { usersApi } from '@/lib/api/users';
import { apiErrorMessage } from '@/lib/api/api-error';
import { usePermission } from '@/lib/permissions';
import { localISODate } from '@/lib/date';
import { useTableSort } from '@/lib/use-table-sort';
import { usePagination } from '@/lib/use-pagination';
import {
  STATUS,
  addMonths,
  dailyNeeded,
  fmtGs,
  gap,
  goalStatus,
  monthProgress,
  percentOf,
  periodLabel,
  sellerRows,
  statusCounts,
  type GoalStatus,
  type MonthProgress,
  type SellerRow,
} from '@/lib/sales-targets';
import { NumericInput } from '@/components/numeric-input';
import { SortableHeader } from '@/components/sortable-header';
import { TablePagination } from '@/components/table-pagination';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const NUM_CLS =
  'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';
const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const SELLER_SORT = {
  rank: (row: SellerRow) => row.rank,
  name: (row: SellerRow) => row.name,
  actual: (row: SellerRow) => row.actual,
  target: (row: SellerRow) => row.target,
  percent: (row: SellerRow) => row.percent,
  remaining: (row: SellerRow) => row.remaining,
  status: (row: SellerRow) => STATUS[row.status].label,
  cash: (row: SellerRow) => row.cashAmount,
  cashCount: (row: SellerRow) => row.cashCount,
  credit: (row: SellerRow) => row.creditAmount,
  creditCount: (row: SellerRow) => row.creditCount,
};
const BY_RANK = (a: SellerRow, b: SellerRow) => a.rank - b.rank;

// ── Piezas ─────────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: GoalStatus }) {
  const { label, color } = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/** La barra de lo logrado, con una marca de dónde habría que estar hoy. */
function PaceBar({
  percent,
  status,
  progress,
  size = 'md',
}: {
  percent: number | null;
  status: GoalStatus;
  progress: MonthProgress;
  size?: 'md' | 'lg';
}) {
  const showPace = percent !== null && progress.fraction > 0 && progress.fraction < 1;
  return (
    <div className="relative">
      <div className={cn('w-full overflow-hidden rounded-full bg-muted', size === 'lg' ? 'h-3' : 'h-2')}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, percent ?? 0)}%`, background: STATUS[status].color }}
        />
      </div>
      {showPace && (
        <span
          aria-hidden
          title="Donde habría que estar hoy"
          className={cn('absolute top-1/2 w-0.5 -translate-y-1/2 rounded-full bg-foreground/60', size === 'lg' ? 'h-5' : 'h-3.5')}
          style={{ left: `${progress.fraction * 100}%` }}
        />
      )}
    </div>
  );
}

function TargetEditor({
  current,
  canEdit,
  pending,
  onSave,
  size = 'md',
}: {
  current: number | null;
  canEdit: boolean;
  pending: boolean;
  onSave: (amount: number) => void;
  size?: 'sm' | 'md' | 'xl';
}) {
  const [editing, setEditing] = useState(false);
  const [millions, setMillions] = useState(0);

  if (editing) {
    const commit = () => {
      if (millions > 0) onSave(Math.round(millions * 1_000_000));
      setEditing(false);
    };
    return (
      <div className="flex items-center gap-1.5">
        <div className="relative w-32">
          <NumericInput
            autoFocus
            aria-label="Meta en millones de guaraníes"
            value={millions}
            onChange={setMillions}
            decimals={1}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') setEditing(false);
            }}
            className={cn(NUM_CLS, 'h-8 pr-14 text-sm')}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            millones
          </span>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Guardar meta" onClick={commit}>
          <Check size={14} />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Cancelar" onClick={() => setEditing(false)}>
          <X size={14} />
        </Button>
      </div>
    );
  }

  const amount = current !== null ? (
    <span
      className={cn(
        'tabular-nums text-foreground',
        size === 'xl' ? 'text-3xl font-bold tracking-tight' : 'font-semibold',
        size === 'md' && 'text-base',
      )}
    >
      {fmtGs(current)}
    </span>
  ) : (
    <span className={cn('text-muted-foreground', size === 'xl' && 'text-xl font-semibold')}>Sin meta</span>
  );
  if (!canEdit) return amount;
  return (
    <span className="inline-flex items-center gap-1.5">
      {amount}
      <Button
        size={size === 'xl' ? 'icon-sm' : 'icon-xs'}
        variant="ghost"
        disabled={pending}
        aria-label={current !== null ? 'Cambiar la meta' : 'Definir la meta'}
        onClick={() => {
          setMillions(current !== null ? current / 1_000_000 : 0);
          setEditing(true);
        }}
      >
        {current !== null ? <Pencil size={size === 'xl' ? 15 : 12} /> : <Plus size={size === 'xl' ? 15 : 12} />}
      </Button>
    </span>
  );
}

function Figure({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-muted/40 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-lg font-semibold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Lo vendido contra la meta: de la empresa o, para un vendedor, lo suyo. */
function GoalSummary({
  title,
  goalLabel,
  actual,
  target,
  progress,
  canEdit,
  pending,
  onSave,
}: {
  title: string;
  goalLabel: string;
  actual: number;
  target: number | null;
  progress: MonthProgress;
  canEdit: boolean;
  pending: boolean;
  onSave: (amount: number) => void;
}) {
  const percent = percentOf(actual, target);
  const status = goalStatus(actual, target, progress);
  const difference = gap(actual, target);
  const perDay = dailyNeeded(actual, target, progress);

  return (
    <section aria-label={title} className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Building2 size={17} className="text-muted-foreground" />
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>

      <dl className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:divide-x md:divide-border">
        <div className="min-w-0">
          <dt className="text-sm text-muted-foreground">Vendido</dt>
          <dd className="mt-1 break-words text-3xl font-bold tabular-nums tracking-tight">{fmtGs(actual)}</dd>
        </div>
        <div className="min-w-0 md:pl-6">
          <dt className="text-sm text-muted-foreground">{goalLabel}</dt>
          <dd className="mt-1 break-words">
            <TargetEditor size="xl" current={target} canEdit={canEdit} pending={pending} onSave={onSave} />
          </dd>
        </div>
        <div className="md:pl-6 md:text-right">
          <dt className="text-sm text-muted-foreground">Cumplido</dt>
          <dd className="mt-1">
            {percent !== null ? (
              <span className="block text-4xl font-bold leading-none tabular-nums" style={{ color: STATUS[status].color }}>
                {percent}%
              </span>
            ) : (
              <span className="block text-xl font-semibold text-muted-foreground">—</span>
            )}
            {status !== 'none' && (
              <span className="mt-2 inline-block">
                <StatusChip status={status} />
              </span>
            )}
          </dd>
        </div>
      </dl>

      {target !== null && <PaceBar percent={percent} status={status} progress={progress} size="lg" />}

      {target !== null && difference && (
        <dl className="grid gap-3 md:grid-cols-3">
          <Figure
            label={difference.kind === 'missing' ? 'Falta para la meta' : 'Superó la meta por'}
            value={fmtGs(difference.amount)}
            color={difference.kind === 'exceeded' ? STATUS.achieved.color : undefined}
          />
          <Figure
            label="Hay que vender por día"
            value={perDay !== null ? fmtGs(perDay) : '—'}
            hint={perDay !== null ? `En los ${progress.left} ${progress.left === 1 ? 'día que queda' : 'días que quedan'}` : undefined}
          />
          <Figure
            label="Del mes recorrido"
            value={`${Math.round(progress.fraction * 100)}%`}
            hint={`${progress.elapsed} de ${progress.days} días · la marca en la barra`}
          />
        </dl>
      )}
    </section>
  );
}

function AddSellerTarget({
  existingIds,
  pending,
  onAdd,
  onCancel,
}: {
  existingIds: Set<string>;
  pending: boolean;
  onAdd: (userId: string, amount: number) => void;
  onCancel: () => void;
}) {
  const [userId, setUserId] = useState('');
  const [millions, setMillions] = useState(0);
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const available = users.filter((user) => user.status === 'ACTIVE' && !existingIds.has(user.id));
  const chosen = available.find((user) => user.id === userId);

  return (
    <div className="space-y-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">Meta para un vendedor que todavía no vendió este mes</p>
      <div className="flex flex-wrap gap-2">
        <Select value={userId || 'none'} onValueChange={(value) => setUserId(value && value !== 'none' ? value : '')}>
          <SelectTrigger className="min-w-56 flex-1">
            <span className="flex-1 truncate text-left text-sm">
              {chosen ? `${chosen.firstName} ${chosen.lastName}` : 'Elegir vendedor…'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Elegir vendedor…</SelectItem>
            {available.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-40">
          <NumericInput
            aria-label="Meta en millones de guaraníes"
            value={millions}
            onChange={setMillions}
            decimals={1}
            placeholder="Meta"
            className={cn(NUM_CLS, 'pr-16')}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            millones
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!userId || !millions || pending}
          onClick={() => onAdd(userId, Math.round(millions * 1_000_000))}
        >
          <Check size={13} /> Guardar
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X size={13} /> Cancelar
        </Button>
      </div>
    </div>
  );
}

function SellersTable({
  rows,
  progress,
  canEdit,
  pending,
  onSave,
}: {
  rows: SellerRow[];
  progress: MonthProgress;
  canEdit: boolean;
  pending: boolean;
  onSave: (userId: string, amount: number) => void;
}) {
  const { sorted, sort, toggle } = useTableSort(rows, SELLER_SORT, BY_RANK);
  const pagination = usePagination(sorted);
  const header = (label: string, key: keyof typeof SELLER_SORT, align?: 'right' | 'center') => (
    <SortableHeader label={label} sortKey={key} sort={sort} onSort={toggle} align={align} className="whitespace-nowrap px-2.5 first:pl-4 last:pr-4" />
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              {header('#', 'rank', 'center')}
              {header('Vendedor', 'name')}
              {header('Vendido', 'actual', 'right')}
              {header('Meta', 'target', 'right')}
              {header('Cumplido', 'percent')}
              {header('Diferencia', 'remaining', 'right')}
              {header('Estado', 'status')}
              {header('Contado', 'cash', 'right')}
              {header('Ventas contado', 'cashCount', 'right')}
              {header('Crédito', 'credit', 'right')}
              {header('Ventas crédito', 'creditCount', 'right')}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pagination.items.map((row) => (
              <tr key={row.seller.id} className="transition-colors hover:bg-muted/20">
                <td className="px-2.5 py-3 first:pl-4 last:pr-4 text-center tabular-nums">
                  {MEDALS[row.rank] ? (
                    <span aria-label={`${row.rank}° puesto`}>{MEDALS[row.rank]}</span>
                  ) : (
                    <span className="text-muted-foreground">{row.rank}°</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2.5 py-3 first:pl-4 last:pr-4 font-medium">{row.name}</td>
                <td className="whitespace-nowrap px-2.5 py-3 first:pl-4 last:pr-4 text-right text-base font-bold tabular-nums">
                  {fmtGs(row.actual)}
                </td>
                <td className="whitespace-nowrap px-2.5 py-3 first:pl-4 last:pr-4 text-right">
                  <TargetEditor
                    size="sm"
                    current={row.target}
                    canEdit={canEdit}
                    pending={pending}
                    onSave={(amount) => onSave(row.seller.id, amount)}
                  />
                </td>
                <td className="min-w-28 px-2.5 py-3 first:pl-4 last:pr-4">
                  {row.percent !== null ? (
                    <div className="space-y-1.5">
                      <span className="font-bold tabular-nums" style={{ color: STATUS[row.status].color }}>
                        {row.percent}%
                      </span>
                      <PaceBar percent={row.percent} status={row.status} progress={progress} />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2.5 py-3 first:pl-4 last:pr-4 text-right tabular-nums">
                  {row.remaining === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : row.remaining > 0 ? (
                    <span title="Falta para la meta">−{fmtGs(row.remaining)}</span>
                  ) : (
                    <span title="Superó la meta por" className="font-semibold" style={{ color: STATUS.achieved.color }}>
                      +{fmtGs(-row.remaining)}
                    </span>
                  )}
                </td>
                <td className="px-2.5 py-3 first:pl-4 last:pr-4">
                  <StatusChip status={row.status} />
                </td>
                <td className="whitespace-nowrap px-2.5 py-3 first:pl-4 last:pr-4 text-right tabular-nums">
                  {fmtGs(row.cashAmount)}
                </td>
                <td className="px-2.5 py-3 first:pl-4 last:pr-4 text-right font-semibold tabular-nums">
                  {row.cashCount}
                </td>
                <td className="whitespace-nowrap px-2.5 py-3 first:pl-4 last:pr-4 text-right tabular-nums">
                  {fmtGs(row.creditAmount)}
                </td>
                <td className="px-2.5 py-3 first:pl-4 last:pr-4 text-right font-semibold tabular-nums">
                  {row.creditCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-3">
        <TablePagination {...pagination.controls} label="vendedores" />
      </div>
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default function SalesTargetsPage() {
  const qc = useQueryClient();
  const today = localISODate(new Date());
  const thisPeriod = today.slice(0, 7);
  const [period, setPeriod] = useState(thisPeriod);
  const [adding, setAdding] = useState(false);
  const canEditTargets = usePermission('sales:manage');
  const progress = monthProgress(period, today);

  const performance = useQuery({
    queryKey: ['sales-performance', period],
    queryFn: () => salesApi.getPerformance(period),
  });
  const perf = performance.data;
  const canManage = perf?.canManage ?? false;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['sales-performance', period] });

  const setCompanyTarget = useMutation({
    mutationFn: (amount: number) => salesApi.setCompanyTarget({ period, targetAmount: amount }),
    onSuccess: refresh,
  });
  const setSellerTarget = useMutation({
    mutationFn: ({ userId, amount }: { userId: string; amount: number }) =>
      salesApi.setSellerTarget(userId, { period, targetAmount: amount }),
    onSuccess: () => {
      refresh();
      setAdding(false);
    },
  });

  const rows = sellerRows(perf?.sellers ?? [], progress);
  const counts = statusCounts(rows);
  const mine: SellerStat | undefined = !canManage ? perf?.sellers[0] : undefined;
  const failure = setCompanyTarget.error ?? setSellerTarget.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Metas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lo vendido contra la meta de cada mes
            {progress.fraction > 0 && progress.fraction < 1 ? ` · van ${progress.elapsed} de ${progress.days} días` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" aria-label="Mes anterior" onClick={() => setPeriod((p) => addMonths(p, -1))}>
            <ChevronLeft size={16} />
          </Button>
          <h2 className="min-w-40 text-center text-base font-semibold first-letter:uppercase">{periodLabel(period)}</h2>
          <Button variant="outline" size="icon-sm" aria-label="Mes siguiente" onClick={() => setPeriod((p) => addMonths(p, 1))}>
            <ChevronRight size={16} />
          </Button>
          {period !== thisPeriod && (
            <Button variant="ghost" size="sm" onClick={() => setPeriod(thisPeriod)}>
              Este mes
            </Button>
          )}
        </div>
      </div>

      {failure ? (
        <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {apiErrorMessage(failure, 'No se pudo guardar la meta.')}
        </p>
      ) : null}

      {performance.isPending && (
        <div className="space-y-4" aria-busy="true">
          <div className="h-48 animate-pulse rounded-2xl bg-muted" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </div>
      )}
      {performance.error && (
        <div className="space-y-3">
          <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {apiErrorMessage(performance.error, 'No se pudieron cargar las metas.')}
          </p>
          <Button variant="outline" size="sm" onClick={() => void performance.refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {perf && canManage && (
        <GoalSummary
          title="Ventas de la empresa"
          goalLabel="Meta de la empresa"
          actual={perf.companyActual}
          target={perf.companyTarget}
          progress={progress}
          canEdit={canEditTargets}
          pending={setCompanyTarget.isPending}
          onSave={(amount) => setCompanyTarget.mutate(amount)}
        />
      )}
      {perf && !canManage && mine && (
        <GoalSummary
          title="Tus ventas"
          goalLabel="Tu meta"
          actual={mine.actual}
          target={mine.target}
          progress={progress}
          canEdit={false}
          pending={false}
          onSave={() => undefined}
        />
      )}

      {perf && canManage && (
        <section aria-label="Vendedores" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Vendedores</h2>
              {(['achieved', 'on-track', 'behind', 'missed', 'none'] as const)
                .filter((status) => counts[status])
                .map((status) => (
                  <span key={status} className="text-xs text-muted-foreground">
                    <StatusChip status={status} /> {counts[status]}
                  </span>
                ))}
            </div>
            {canEditTargets && !adding && (
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <Plus size={13} /> Agregar meta
              </Button>
            )}
          </div>

          {adding && (
            <AddSellerTarget
              existingIds={new Set(rows.map((row) => row.seller.id))}
              pending={setSellerTarget.isPending}
              onAdd={(userId, amount) => setSellerTarget.mutate({ userId, amount })}
              onCancel={() => setAdding(false)}
            />
          )}

          {rows.length === 0 ? (
            <EmptySales manager />
          ) : (
            <SellersTable
              rows={rows}
              progress={progress}
              canEdit={canEditTargets}
              pending={setSellerTarget.isPending}
              onSave={(userId, amount) => setSellerTarget.mutate({ userId, amount })}
            />
          )}
        </section>
      )}

      {perf && !canManage && !mine && <EmptySales manager={false} />}
    </div>
  );
}

function EmptySales({ manager }: { manager: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border py-10 text-center">
      <Target size={28} className="mx-auto mb-2 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">
        {manager ? 'Todavía no hay ventas en este mes.' : 'Todavía no tenés ventas en este mes.'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Cuentan las ventas confirmadas o facturadas.</p>
    </div>
  );
}
