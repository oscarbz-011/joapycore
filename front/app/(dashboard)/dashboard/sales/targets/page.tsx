'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Target,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
  X,
  Plus,
  Building2,
  Trophy,
  CreditCard,
  Banknote,
} from 'lucide-react';
import {
  salesApi,
  type SellerStat,
} from '../../../../../lib/api/sales';
import { NumericInput } from '../../../../../components/numeric-input';
import { usersApi } from '../../../../../lib/api/users';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────────────────

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtGs(n: number) {
  return 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
}

function pct(actual: number, target: number | null) {
  if (!target || target === 0) return null;
  return Math.min(100, Math.round((actual / target) * 100));
}

function periodLabel(period: string) {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('es-PY', {
    month: 'long',
    year: 'numeric',
  });
}

function addMonths(period: string, delta: number) {
  const [year, month] = period.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ value, color = '#059669' }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, value)}%`, background: color }}
      />
    </div>
  );
}

// ── Target input (inline edit) ─────────────────────────────────────────────────

function TargetInput({
  current,
  onSave,
}: {
  current: number | null;
  onSave: (amount: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number>(current != null ? current / 1_000_000 : 0);

  function commit() {
    if (value > 0) onSave(value * 1_000_000);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 mt-1">
        <div className="relative w-28">
          <NumericInput
            autoFocus
            value={value}
            onChange={setValue}
            decimals={1}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            className="w-full h-7 min-w-0 rounded-xl border border-transparent bg-input/50 pl-2 pr-7 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">M</span>
        </div>
        <button onClick={commit} className="text-emerald-600 hover:text-emerald-800"><Check size={14} /></button>
        <button onClick={() => setEditing(false)} className="text-muted-foreground/60 hover:text-muted-foreground"><X size={14} /></button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setValue(current != null ? current / 1_000_000 : 0); setEditing(true); }}
      className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground mt-1 transition-colors"
    >
      <span>{current != null ? `Meta: ${fmtGs(current)}` : 'Sin meta establecida'}</span>
      <Pencil size={10} />
    </button>
  );
}

// ── Seller card ────────────────────────────────────────────────────────────────

const RANK_BADGE: Record<number, string> = {
  1: 'bg-yellow-100 text-amber-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  2: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  3: 'bg-orange-100 text-amber-900 dark:bg-orange-900/30 dark:text-orange-300',
};

const RANK_LABEL: Record<number, string> = {
  1: '🥇 1°',
  2: '🥈 2°',
  3: '🥉 3°',
};

function SellerCard({
  stat,
  rank,
  canManage,
  onTargetSave,
}: {
  stat: SellerStat;
  rank: number;
  canManage: boolean;
  onTargetSave: (userId: string, amount: number) => void;
}) {
  const progress = pct(stat.actual, stat.target);
  const name = `${stat.seller.firstName} ${stat.seller.lastName}`;

  const barColor =
    progress === null ? '#94a3b8' :
    progress >= 100   ? '#059669' :
    progress >= 70    ? '#2563eb' :
    progress >= 40    ? '#b45309' :
                        '#dc2626';

  const totalOrders = stat.cashCount + stat.creditCount;

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground text-sm truncate">{name}</p>
            {canManage && RANK_BADGE[rank] && (
              <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-bold shrink-0', RANK_BADGE[rank])}>
                {RANK_LABEL[rank]}
              </span>
            )}
          </div>
          {canManage ? (
            <TargetInput
              current={stat.target}
              onSave={(amount) => onTargetSave(stat.seller.id, amount)}
            />
          ) : (
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {stat.target != null ? `Meta: ${fmtGs(stat.target)}` : 'Sin meta establecida'}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-foreground">{fmtGs(stat.actual)}</p>
          {progress !== null && (
            <p className={cn('text-xs font-semibold', progress >= 100 ? 'text-emerald-600' : progress >= 70 ? 'text-blue-600' : 'text-muted-foreground')}>
              {progress}% de meta
            </p>
          )}
        </div>
      </div>

      <ProgressBar value={progress ?? 0} color={barColor} />

      {totalOrders > 0 && (
        <div className="flex gap-4 pt-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Banknote size={12} className="text-emerald-500 shrink-0" />
            <span>Contado:</span>
            <span className="font-medium">{fmtGs(stat.cashAmount)} ({stat.cashCount})</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CreditCard size={12} className="text-amber-500 shrink-0" />
            <span>Crédito:</span>
            <span className="font-medium">{fmtGs(stat.creditAmount)} ({stat.creditCount})</span>
          </div>
        </div>
      )}

      {stat.target != null && (
        <p className="text-xs text-muted-foreground/60">
          Faltan {fmtGs(Math.max(0, stat.target - stat.actual))} para la meta
        </p>
      )}
    </div>
  );
}

// ── Add seller target form ─────────────────────────────────────────────────────

function AddSellerForm({
  existingIds,
  onAdd,
  onCancel,
}: {
  period: string;
  existingIds: Set<string>;
  onAdd: (userId: string, amount: number) => void;
  onCancel: () => void;
}) {
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState<number>(0);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  });

  const available = users.filter((u) => u.status === 'ACTIVE' && !existingIds.has(u.id));

  return (
    <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Agregar meta para vendedor</p>
      <div className="flex gap-2">
        <Select value={userId || 'none'} onValueChange={(v) => setUserId(v && v !== 'none' ? v : '')}>
          <SelectTrigger className="flex-1">
            <span className="flex-1 text-left text-sm truncate">{available.find((u) => u.id === userId) ? `${available.find((u) => u.id === userId)?.firstName} ${available.find((u) => u.id === userId)?.lastName}` : 'Seleccionar vendedor…'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Seleccionar vendedor…</SelectItem>
            {available.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-36">
          <NumericInput
            value={amount}
            onChange={setAmount}
            decimals={1}
            placeholder="Meta en M"
            className={cn(NUM_CLS, 'pr-12')}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">M Gs.</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!userId || !amount}
          onClick={() => onAdd(userId, amount * 1_000_000)}
        >
          <Check size={13} />
          Guardar
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <X size={13} />
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SalesTargetsPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod);
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: perf, isLoading } = useQuery({
    queryKey: ['sales-performance', period],
    queryFn: () => salesApi.getPerformance(period),
  });

  const canManage = perf?.canManage ?? false;

  const setCompanyTarget = useMutation({
    mutationFn: (amount: number) =>
      salesApi.setCompanyTarget({ period, targetAmount: amount }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales-performance', period] }),
  });

  const setSellerTarget = useMutation({
    mutationFn: ({ userId, amount }: { userId: string; amount: number }) =>
      salesApi.setSellerTarget(userId, { period, targetAmount: amount }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sales-performance', period] });
      setShowAddForm(false);
    },
  });

  const existingSellerIds = new Set((perf?.sellers ?? []).map((s) => s.seller.id));
  const companyProgress = pct(perf?.companyActual ?? 0, perf?.companyTarget ?? null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Metas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Rendimiento y metas por vendedor</p>
      </div>

      {/* Period navigator */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPeriod((p) => addMonths(p, -1))}
          >
            <ChevronLeft size={16} />
          </Button>
          <h2 className="text-base font-semibold text-foreground capitalize min-w-[160px] text-center">
            {periodLabel(period)}
          </h2>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPeriod((p) => addMonths(p, 1))}
          >
            <ChevronRight size={16} />
          </Button>
          {period !== currentPeriod() && (
            <button
              onClick={() => setPeriod(currentPeriod())}
              className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Hoy
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/30" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Company-wide card — only shown to managers */}
          {canManage && (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/30">
                    <Building2 size={16} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Meta empresa</p>
                    <p className="text-xs text-muted-foreground/60">Total de ventas del período</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-foreground">{fmtGs(perf?.companyActual ?? 0)}</p>
                  {companyProgress !== null && (
                    <p className={cn('text-xs font-semibold', companyProgress >= 100 ? 'text-emerald-600' : 'text-muted-foreground')}>
                      {companyProgress}% de meta
                    </p>
                  )}
                </div>
              </div>

              <ProgressBar
                value={companyProgress ?? 0}
                color={companyProgress === null ? '#94a3b8' : companyProgress >= 100 ? '#059669' : '#2563eb'}
              />

              <TargetInput
                current={perf?.companyTarget ?? null}
                onSave={(amount) => setCompanyTarget.mutate(amount)}
              />
            </div>
          )}

          {/* Sellers section */}
          <div>
            {canManage && (
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Trophy size={15} className="text-muted-foreground" />
                  <p className="text-sm font-semibold text-muted-foreground">Vendedores</p>
                  {perf && perf.sellers.length > 0 && (
                    <span className="rounded-full bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {perf.sellers.length}
                    </span>
                  )}
                </div>
                {!showAddForm && (
                  <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
                    <Plus size={13} />
                    Agregar meta
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-3">
              {canManage && showAddForm && (
                <AddSellerForm
                  period={period}
                  existingIds={existingSellerIds}
                  onAdd={(userId, amount) => setSellerTarget.mutate({ userId, amount })}
                  onCancel={() => setShowAddForm(false)}
                />
              )}

              {!perf || perf.sellers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-10 text-center">
                  <Target size={28} className="mx-auto mb-2 text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">
                    {canManage
                      ? 'Sin ventas registradas en este período'
                      : 'No tenés ventas registradas en este período'}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Las ventas confirmadas o facturadas aparecerán aquí.
                  </p>
                </div>
              ) : (
                perf.sellers.map((stat, idx) => (
                  <SellerCard
                    key={stat.seller.id}
                    stat={stat}
                    rank={idx + 1}
                    canManage={canManage}
                    onTargetSave={(userId, amount) =>
                      setSellerTarget.mutate({ userId, amount })
                    }
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
