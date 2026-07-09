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
import { usersApi } from '../../../../../lib/api/users';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtGs(n: number) {
  if (n >= 1_000_000_000) return `Gs. ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `Gs. ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `Gs. ${Math.round(n / 1_000)}k`;
  return `Gs. ${Math.round(n)}`;
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
    <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
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
  const [value, setValue] = useState(current != null ? String(current / 1_000_000) : '');

  function commit() {
    const n = Number(value);
    if (n > 0) onSave(n * 1_000_000);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 mt-1">
        <div className="relative">
          <input
            autoFocus
            type="number"
            min={0}
            step={0.1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            className="w-28 rounded-md border border-border-strong py-1 pl-2 pr-8 text-xs focus:border-border-strong focus:outline-none"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">M</span>
        </div>
        <button onClick={commit} className="text-emerald-600 hover:text-emerald-800"><Check size={14} /></button>
        <button onClick={() => setEditing(false)} className="text-faint hover:text-muted"><X size={14} /></button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setValue(current != null ? String(current / 1_000_000) : ''); setEditing(true); }}
      className="flex items-center gap-1 text-xs text-faint hover:text-muted mt-1 transition-colors"
    >
      <span>{current != null ? `Meta: ${fmtGs(current)}` : 'Sin meta establecida'}</span>
      <Pencil size={10} />
    </button>
  );
}

// ── Seller card ────────────────────────────────────────────────────────────────

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

  const rankBadge =
    rank === 1 ? { bg: '#fef9c3', text: '#854d0e', label: '🥇 1°' } :
    rank === 2 ? { bg: '#f1f5f9', text: '#475569', label: '🥈 2°' } :
    rank === 3 ? { bg: '#fef3e2', text: '#92400e', label: '🥉 3°' } :
                 null;

  const totalOrders = stat.cashCount + stat.creditCount;

  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-ink text-sm truncate">{name}</p>
            {canManage && rankBadge && (
              <span
                className="rounded-[6px] px-1.5 py-0.5 text-[11px] font-bold shrink-0"
                style={{ background: rankBadge.bg, color: rankBadge.text }}
              >
                {rankBadge.label}
              </span>
            )}
          </div>
          {canManage ? (
            <TargetInput
              current={stat.target}
              onSave={(amount) => onTargetSave(stat.seller.id, amount)}
            />
          ) : (
            <p className="text-xs text-faint mt-0.5">
              {stat.target != null ? `Meta: ${fmtGs(stat.target)}` : 'Sin meta establecida'}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-ink">{fmtGs(stat.actual)}</p>
          {progress !== null && (
            <p className={`text-xs font-semibold ${progress >= 100 ? 'text-emerald-600' : progress >= 70 ? 'text-blue-600' : 'text-muted'}`}>
              {progress}% de meta
            </p>
          )}
        </div>
      </div>

      <ProgressBar value={progress ?? 0} color={barColor} />

      {/* Cash / Credit breakdown */}
      {totalOrders > 0 && (
        <div className="flex gap-4 pt-1">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Banknote size={12} className="text-emerald-500 shrink-0" />
            <span>Contado:</span>
            <span className="font-medium text-muted">
              {fmtGs(stat.cashAmount)} ({stat.cashCount})
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <CreditCard size={12} className="text-amber-500 shrink-0" />
            <span>Crédito:</span>
            <span className="font-medium text-muted">
              {fmtGs(stat.creditAmount)} ({stat.creditCount})
            </span>
          </div>
        </div>
      )}

      {stat.target != null && (
        <p className="text-xs text-faint">
          Faltan {fmtGs(Math.max(0, stat.target - stat.actual))} para la meta
        </p>
      )}
    </div>
  );
}

// ── Add seller target form ─────────────────────────────────────────────────────

function AddSellerForm({
  period,
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
  const [amount, setAmount] = useState('');

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  });

  const available = users.filter((u) => u.status === 'ACTIVE' && !existingIds.has(u.id));

  return (
    <div className="rounded-xl border-2 border-dashed border-border bg-surface-2 p-4 space-y-3">
      <p className="text-sm font-medium text-muted">Agregar meta para vendedor</p>
      <div className="flex gap-2">
        <select
          className="flex-1 rounded-lg border border-border bg-surface text-ink px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">Seleccionar vendedor…</option>
          {available.map((u) => (
            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
          ))}
        </select>
        <div className="relative w-36">
          <input
            type="number"
            min={0}
            step={0.1}
            placeholder="Meta en M"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-border py-2 pl-3 pr-8 text-sm focus:border-border-strong focus:outline-none"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">M Gs.</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!userId || !amount}
          onClick={() => onAdd(userId, Number(amount) * 1_000_000)}
          className="flex items-center gap-1.5 rounded-lg bg-border-strong px-3.5 py-1.5 text-sm font-medium text-ink hover:opacity-80 disabled:opacity-40"
        >
          <Check size={13} />
          Guardar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-sm text-muted hover:bg-surface-2"
        >
          <X size={13} />
          Cancelar
        </button>
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
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Metas</h1>
        <p className="mt-1 text-sm text-muted">Rendimiento y metas por vendedor</p>
      </div>

      {/* Period navigator */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPeriod((p) => addMonths(p, -1))}
            className="rounded-lg border border-border p-1.5 text-muted hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-base font-semibold text-ink capitalize min-w-[160px] text-center">
            {periodLabel(period)}
          </h2>
          <button
            onClick={() => setPeriod((p) => addMonths(p, 1))}
            className="rounded-lg border border-border p-1.5 text-muted hover:bg-surface-2 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          {period !== currentPeriod() && (
            <button
              onClick={() => setPeriod(currentPeriod())}
              className="text-xs font-medium text-muted hover:text-ink underline underline-offset-2"
            >
              Hoy
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Company-wide card — only shown to managers */}
          {canManage && (
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2">
                    <Building2 size={16} className="text-muted" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">Meta empresa</p>
                    <p className="text-xs text-faint">Total de ventas del período</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-ink">{fmtGs(perf?.companyActual ?? 0)}</p>
                  {companyProgress !== null && (
                    <p className={`text-xs font-semibold ${companyProgress >= 100 ? 'text-emerald-600' : 'text-muted'}`}>
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
                  <Trophy size={15} className="text-muted" />
                  <p className="text-sm font-semibold text-muted">Vendedores</p>
                  {perf && perf.sellers.length > 0 && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
                      {perf.sellers.length}
                    </span>
                  )}
                </div>
                {!showAddForm && (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface text-ink px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 transition-colors"
                  >
                    <Plus size={13} />
                    Agregar meta
                  </button>
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
                  <Target size={28} className="mx-auto mb-2 text-faint" />
                  <p className="text-sm text-muted">
                    {canManage
                      ? 'Sin ventas registradas en este período'
                      : 'No tenés ventas registradas en este período'}
                  </p>
                  <p className="text-xs text-faint mt-1">
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
