'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, Trash2, ToggleLeft, ToggleRight, Pencil, Check, X, Percent } from 'lucide-react';
import {
  settingsApi,
  type CreditPlan,
  type InterestComponent,
  type InterestComponentFrequency,
} from '../../../../../lib/api/settings';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Hasta 4 decimales (misma precisión que admite el backend), sin ceros de
// más — permite representar tasas menores a 1% (ej. mora diaria de 0,001%)
// sin redondearlas a 0.0%. Para valores "redondos" (15, 20, 27...) el
// resultado es idéntico al de antes ("15.0%").
function fmtRate(rate: number) {
  const n = Number(rate);
  let str = n.toFixed(4).replace(/0+$/, '');
  if (str.endsWith('.')) str += '0';
  return `${str}%`;
}

// Equivalente mensual de una tasa diaria — mismo criterio que usa el
// backend para un "período" (30 días, ver interest-calc.service.ts). Es
// lineal (diaria × 30), no interés compuesto, para que coincida con cómo
// el motor de cálculo devenga un componente DAILY día a día.
const DAYS_PER_PERIOD = 30;
function dailyToMonthly(dailyPct: number): number {
  return dailyPct * DAYS_PER_PERIOD;
}

// El backend devuelve maxIncomePercentage como Decimal — JSON lo serializa
// como string ("30", no 30). Al reenviarlo tal cual en un PUT que solo
// cambia otro campo (día de vencimiento, tolerancia, on/off), el DTO
// (@IsNumber()) lo rechazaba con 400 — nunca llegaba a guardarse nada más
// que el maxIncomePercentage en sí. Mismo criterio que ya usa el resto del
// código (`Number(ar.amount)`, `Number(ap.amount)`, etc.) para convertir un
// Decimal del backend antes de usarlo.
function toNumOrNull(v: number | string | null | undefined): number | null {
  return v == null ? null : Number(v);
}

// ── Add plan form ─────────────────────────────────────────────────────────────

function AddPlanForm({
  existingInstallments,
  onAdd,
  onCancel,
}: {
  existingInstallments: number[];
  onAdd: (installments: number, interestRate: number) => Promise<void>;
  onCancel: () => void;
}) {
  const QUICK_INSTALLMENTS = [3, 6, 12, 18];
  const [installments, setInstallments] = useState<number | ''>('');
  const [rate, setRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const chosen = Number(installments);
  const isDuplicate = existingInstallments.includes(chosen);

  async function handleSubmit() {
    if (!chosen || !rate || isDuplicate) return;
    setError('');
    setSubmitting(true);
    try {
      await onAdd(chosen, Number(rate));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar el plan';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Nuevo plan</p>

      {/* Quick-select installments */}
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground/60">Cuotas</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_INSTALLMENTS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={existingInstallments.includes(n)}
              onClick={() => setInstallments(n)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                installments === n
                  ? 'bg-primary text-primary-foreground'
                  : existingInstallments.includes(n)
                    ? 'cursor-not-allowed bg-muted/30 text-muted-foreground/60'
                    : 'bg-card border border-border text-muted-foreground hover:border-ring/50'
              }`}
            >
              {n}×
            </button>
          ))}
          <input
            type="number"
            min="1"
            placeholder="Otro…"
            value={typeof installments === 'number' && !QUICK_INSTALLMENTS.includes(installments) ? installments : ''}
            onChange={(e) => setInstallments(e.target.value ? Number(e.target.value) : '')}
            className="w-20 rounded-lg border border-border px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </div>
        {isDuplicate && (
          <p className="mt-1 text-xs text-amber-600">Ya existe un plan de {chosen} cuotas.</p>
        )}
      </div>

      {/* Interest rate */}
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground/60">Tasa de interés total</p>
        <div className="relative w-32">
          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="15"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-full rounded-lg border border-border py-1.5 pl-3 pr-8 text-sm focus:border-ring focus:outline-none"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">%</span>
        </div>
        {rate && installments && !isDuplicate && (
          <p className="mt-1 text-xs text-muted-foreground/60">
            Un pedido de Gs. 1.000.000 en {chosen} cuotas: Gs.{' '}
            {Math.round((1_000_000 * (1 + Number(rate) / 100)) / chosen).toLocaleString('es-PY')} / cuota
          </p>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!installments || !rate || isDuplicate || submitting}
          onClick={() => void handleSubmit()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={14} />
          {submitting ? 'Agregando…' : 'Agregar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:bg-muted/20"
        >
          <X size={14} />
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Plan row ──────────────────────────────────────────────────────────────────

function PlanRow({
  plan,
  onToggle,
  onDelete,
  onUpdateRate,
}: {
  plan: CreditPlan;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  onUpdateRate: (id: string, rate: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rateInput, setRateInput] = useState(String(plan.interestRate));

  function commitEdit() {
    const r = Number(rateInput);
    if (r > 0 && r !== plan.interestRate) {
      onUpdateRate(plan.id, r);
    }
    setEditing(false);
  }

  return (
    <div className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-all ${
      plan.isActive ? 'border-border bg-card' : 'border-border bg-muted/30 opacity-60'
    }`}>
      {/* Installments badge */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/30">
        <span className="text-sm font-bold text-muted-foreground">{plan.installments}×</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{plan.installments} cuotas</p>
        {editing ? (
          <div className="mt-1 flex items-center gap-1.5">
            <div className="relative w-24">
              <input
                autoFocus
                type="number"
                min="0"
                step="0.1"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
                className="w-full rounded-md border border-border py-0.5 pl-2 pr-6 text-xs focus:border-ring focus:outline-none"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">%</span>
            </div>
            <button type="button" onClick={commitEdit} className="text-muted-foreground hover:text-foreground"><Check size={13} /></button>
            <button type="button" onClick={() => { setRateInput(String(plan.interestRate)); setEditing(false); }} className="text-muted-foreground/60 hover:text-muted-foreground"><X size={13} /></button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <span>{fmtRate(plan.interestRate)} interés total</span>
            <Pencil size={10} />
          </button>
        )}
      </div>

      {/* Monthly estimate hint */}
      <div className="hidden sm:block text-right">
        <p className="text-xs text-muted-foreground/60">Por Gs. 1.000.000</p>
        <p className="text-xs font-medium text-muted-foreground">
          ≈ Gs. {Math.round((1_000_000 * (1 + plan.interestRate / 100)) / plan.installments).toLocaleString('es-PY')} /cuota
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          title={plan.isActive ? 'Desactivar plan' : 'Activar plan'}
          onClick={() => onToggle(plan.id, !plan.isActive)}
          className="text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          {plan.isActive ? <ToggleRight size={20} className="text-emerald-500" /> : <ToggleLeft size={20} />}
        </button>
        <button
          type="button"
          title="Eliminar plan"
          onClick={() => onDelete(plan.id)}
          className="text-muted-foreground/60 hover:text-destructive transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Interest components ─────────────────────────────────────────────────────

const FREQUENCY_LABELS: Record<InterestComponentFrequency, string> = {
  ONE_TIME: 'Una sola vez',
  DAILY: 'Diario',
  MONTHLY: 'Mensual',
};

const FREQUENCY_HINTS: Record<InterestComponentFrequency, string> = {
  ONE_TIME: 'Se cobra una sola vez apenas se vence la tolerancia — no crece con el tiempo. Ej: gastos administrativos.',
  DAILY: 'Se acumula por cada día de atraso. Ej: interés diario por mora.',
  MONTHLY: 'Se aplica desde el primer día de mora por cada período de 30 días iniciado. Ej: gastos de cobranza mensuales.',
};

function AddComponentForm({
  onAdd,
  onCancel,
}: {
  onAdd: (dto: { name: string; frequency: InterestComponentFrequency; percentage: number; cumulative: boolean }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<InterestComponentFrequency>('DAILY');
  const [percentage, setPercentage] = useState('');
  const [cumulative, setCumulative] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!name.trim() || !percentage) return;
    setError('');
    setSubmitting(true);
    try {
      await onAdd({ name: name.trim(), frequency, percentage: Number(percentage), cumulative });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al agregar el componente');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Nuevo componente</p>

      <div>
        <p className="mb-1.5 text-xs text-muted-foreground/60">Nombre</p>
        <input
          type="text"
          placeholder="Ej: Gastos administrativos, Interés moratorio"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground/60">Frecuencia</p>
          <div className="flex gap-2">
            {(Object.keys(FREQUENCY_LABELS) as InterestComponentFrequency[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFrequency(f)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  frequency === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-muted-foreground hover:border-ring/50'
                }`}
              >
                {FREQUENCY_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs text-muted-foreground/60">Porcentaje</p>
          <div className="relative w-24">
            <input
              type="number"
              min="0"
              step="0.0001"
              placeholder="10"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              className="w-full rounded-lg border border-border py-1.5 pl-3 pr-8 text-sm focus:border-ring focus:outline-none"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">%</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground/60">{FREQUENCY_HINTS[frequency]}</p>

      {frequency === 'DAILY' && percentage && (
        <p className="text-xs text-muted-foreground/60">
          Equivale a {fmtRate(dailyToMonthly(Number(percentage)))} mensual (30 días)
        </p>
      )}

      {frequency === 'MONTHLY' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={cumulative}
            onChange={(e) => setCumulative(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-xs text-muted-foreground">
            Acumulativo — el cargo crece cada mes (mes 1={percentage || 'X'}%, mes 2={percentage ? Number(percentage) * 2 : 'X'}%, mes 3={percentage ? Number(percentage) * 3 : 'X'}%...)
          </span>
        </label>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!name.trim() || !percentage || submitting}
          onClick={() => void handleSubmit()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={14} />
          {submitting ? 'Agregando…' : 'Agregar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:bg-muted/20"
        >
          <X size={14} />
          Cancelar
        </button>
      </div>
    </div>
  );
}

function ComponentRow({
  component,
  onToggle,
  onDelete,
  onUpdateRate,
}: {
  component: InterestComponent;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  onUpdateRate: (id: string, percentage: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const pct = Number(component.percentage);
  const [rateInput, setRateInput] = useState(String(pct));

  function commitEdit() {
    const r = Number(rateInput);
    if (r > 0 && r !== pct) onUpdateRate(component.id, r);
    setEditing(false);
  }

  return (
    <div className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-all ${
      component.isActive ? 'border-border bg-card' : 'border-border bg-muted/30 opacity-60'
    }`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/30">
        <Percent size={16} className="text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{component.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground/60">
            {FREQUENCY_LABELS[component.frequency]}
            {component.frequency === 'MONTHLY' && (component.cumulative ? ' · acumulativo' : ' · una vez')}
          </span>
          {editing ? (
            <div className="flex items-center gap-1.5">
              <div className="relative w-20">
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step="0.0001"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
                  className="w-full rounded-md border border-border py-0.5 pl-2 pr-6 text-xs focus:border-ring focus:outline-none"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">%</span>
              </div>
              <button type="button" onClick={commitEdit} className="text-muted-foreground hover:text-foreground"><Check size={13} /></button>
              <button type="button" onClick={() => { setRateInput(String(pct)); setEditing(false); }} className="text-muted-foreground/60 hover:text-muted-foreground"><X size={13} /></button>
              {component.frequency === 'DAILY' && Number(rateInput) > 0 && (
                <span className="text-xs text-muted-foreground/60">
                  ≈ {fmtRate(dailyToMonthly(Number(rateInput)))} mensual
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <span>{fmtRate(pct)}</span>
              {component.frequency === 'DAILY' && (
                <span className="text-muted-foreground/40">(≈ {fmtRate(dailyToMonthly(pct))} mensual)</span>
              )}
              <Pencil size={10} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          title={component.isActive ? 'Desactivar' : 'Activar'}
          onClick={() => onToggle(component.id, !component.isActive)}
          className="text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          {component.isActive ? <ToggleRight size={20} className="text-emerald-500" /> : <ToggleLeft size={20} />}
        </button>
        <button
          type="button"
          title="Eliminar"
          onClick={() => onDelete(component.id)}
          className="text-muted-foreground/60 hover:text-destructive transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreditSettingsPage() {
  const qc = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [maxIncomeInput, setMaxIncomeInput] = useState('');
  const [editingMaxIncome, setEditingMaxIncome] = useState(false);
  const [dueDayInput, setDueDayInput] = useState('');
  const [editingDueDay, setEditingDueDay] = useState(false);
  const [graceDaysInput, setGraceDaysInput] = useState('');
  const [editingGraceDays, setEditingGraceDays] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('');
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [showAddComponentForm, setShowAddComponentForm] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['credit-config'],
    queryFn: settingsApi.getCredit,
  });

  const toggleEnabled = useMutation({
    mutationFn: (isEnabled: boolean) =>
      settingsApi.setCreditEnabled(isEnabled, toNumOrNull(config?.maxIncomePercentage)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit-config'] }),
  });

  const updateMaxIncome = useMutation({
    mutationFn: (maxIncomePercentage: number | null) =>
      settingsApi.setCreditEnabled(config?.isEnabled ?? true, maxIncomePercentage),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['credit-config'] });
      setEditingMaxIncome(false);
    },
  });

  const updateDueDay = useMutation({
    mutationFn: (dueDayOfMonth: number) =>
      settingsApi.setCreditEnabled(config?.isEnabled ?? true, toNumOrNull(config?.maxIncomePercentage), dueDayOfMonth, config?.moraGraceDays),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['credit-config'] });
      setEditingDueDay(false);
    },
  });

  const updateGraceDays = useMutation({
    mutationFn: (moraGraceDays: number) =>
      settingsApi.setCreditEnabled(config?.isEnabled ?? true, toNumOrNull(config?.maxIncomePercentage), config?.dueDayOfMonth, moraGraceDays),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['credit-config'] });
      setEditingGraceDays(false);
    },
  });

  const updateDelinquencyThreshold = useMutation({
    mutationFn: (delinquencyThresholdDays: number | null) =>
      settingsApi.setCreditEnabled(
        config?.isEnabled ?? true,
        toNumOrNull(config?.maxIncomePercentage),
        config?.dueDayOfMonth,
        config?.moraGraceDays,
        delinquencyThresholdDays,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['credit-config'] });
      setEditingThreshold(false);
    },
  });

  const addComponent = useMutation({
    mutationFn: (dto: { name: string; frequency: InterestComponentFrequency; percentage: number; cumulative: boolean }) =>
      settingsApi.addInterestComponent(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['credit-config'] });
      setShowAddComponentForm(false);
    },
  });

  const updateComponent = useMutation({
    mutationFn: ({ id, ...dto }: { id: string; percentage?: number; isActive?: boolean }) =>
      settingsApi.updateInterestComponent(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit-config'] }),
  });

  const removeComponent = useMutation({
    mutationFn: (id: string) => settingsApi.removeInterestComponent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit-config'] }),
  });

  const addPlan = useMutation({
    mutationFn: (dto: { installments: number; interestRate: number }) =>
      settingsApi.addCreditPlan(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['credit-config'] });
      setShowAddForm(false);
    },
  });

  const updatePlan = useMutation({
    mutationFn: ({ id, ...dto }: { id: string; interestRate?: number; isActive?: boolean }) =>
      settingsApi.updateCreditPlan(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit-config'] }),
  });

  const removePlan = useMutation({
    mutationFn: (id: string) => settingsApi.removeCreditPlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit-config'] }),
  });

  const enabled = config?.isEnabled ?? false;
  const plans = config?.plans ?? [];
  const existingInstallments = plans.map((p) => p.installments);
  const interestComponents = config?.interestComponents ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/30">
          <CreditCard size={20} className="text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Configuración de Crédito</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Habilita las ventas a crédito y define los planes de financiamiento disponibles.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/30" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Enable/disable toggle */}
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-6 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">Ventas a crédito</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Permite registrar pedidos con plan de cuotas en el módulo de Ventas.
              </p>
            </div>
            <button
              type="button"
              disabled={toggleEnabled.isPending}
              onClick={() => toggleEnabled.mutate(!enabled)}
              className={`relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                enabled ? 'bg-emerald-500' : 'bg-muted/50'
              } disabled:opacity-50`}
            >
              <span
                className={`absolute left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Income-based cap — only visible when enabled */}
          {enabled && (
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-6 py-4">
              <div>
                <p className="text-sm font-medium text-foreground">Tope de cuota por sueldo</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  % máximo del sueldo declarado del cliente que puede ocupar la cuota mensual (sumando otros créditos activos). Vacío = sin tope.
                </p>
              </div>
              {editingMaxIncome ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="relative w-20">
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={maxIncomeInput}
                      onChange={(e) => setMaxIncomeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') updateMaxIncome.mutate(maxIncomeInput ? Number(maxIncomeInput) : null);
                        if (e.key === 'Escape') setEditingMaxIncome(false);
                      }}
                      className="w-full rounded-md border border-border py-1 pl-2 pr-6 text-sm focus:border-ring focus:outline-none"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateMaxIncome.mutate(maxIncomeInput ? Number(maxIncomeInput) : null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingMaxIncome(false)}
                    className="text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMaxIncomeInput(config?.maxIncomePercentage != null ? String(config.maxIncomePercentage) : '');
                    setEditingMaxIncome(true);
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors"
                >
                  {config?.maxIncomePercentage != null ? `${config.maxIncomePercentage}%` : 'Sin tope'}
                  <Pencil size={12} className="text-muted-foreground/60" />
                </button>
              )}
            </div>
          )}

          {/* Due day — only visible when enabled */}
          {enabled && (
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-6 py-4">
              <div>
                <p className="text-sm font-medium text-foreground">Día de vencimiento de cuotas</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  Día del mes en que vencen todas las cuotas de crédito, sin importar la fecha de compra. Siempre se garantiza al menos un mes de plazo para la primera cuota.
                </p>
              </div>
              {editingDueDay ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    autoFocus
                    type="number"
                    min="1"
                    max="28"
                    step="1"
                    value={dueDayInput}
                    onChange={(e) => setDueDayInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && dueDayInput) updateDueDay.mutate(Number(dueDayInput));
                      if (e.key === 'Escape') setEditingDueDay(false);
                    }}
                    className="w-16 rounded-md border border-border py-1 px-2 text-sm focus:border-ring focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!dueDayInput}
                    onClick={() => updateDueDay.mutate(Number(dueDayInput))}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingDueDay(false)}
                    className="text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDueDayInput(String(config?.dueDayOfMonth ?? 5));
                    setEditingDueDay(true);
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors"
                >
                  Día {config?.dueDayOfMonth ?? 5}
                  <Pencil size={12} className="text-muted-foreground/60" />
                </button>
              )}
            </div>
          )}

          {/* Grace days before mora — only visible when enabled */}
          {enabled && (
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-6 py-4">
              <div>
                <p className="text-sm font-medium text-foreground">Tolerancia antes de cobrar mora</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  Días después del vencimiento antes de empezar a devengar interés moratorio sobre las cuotas atrasadas.
                </p>
              </div>
              {editingGraceDays ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    max="60"
                    step="1"
                    value={graceDaysInput}
                    onChange={(e) => setGraceDaysInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && graceDaysInput) updateGraceDays.mutate(Number(graceDaysInput));
                      if (e.key === 'Escape') setEditingGraceDays(false);
                    }}
                    className="w-16 rounded-md border border-border py-1 px-2 text-sm focus:border-ring focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!graceDaysInput}
                    onClick={() => updateGraceDays.mutate(Number(graceDaysInput))}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingGraceDays(false)}
                    className="text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setGraceDaysInput(String(config?.moraGraceDays ?? 0));
                    setEditingGraceDays(true);
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors"
                >
                  {config?.moraGraceDays ? `${config.moraGraceDays} día${config.moraGraceDays === 1 ? '' : 's'}` : 'Sin tolerancia'}
                  <Pencil size={12} className="text-muted-foreground/60" />
                </button>
              )}
            </div>
          )}

          {/* Delinquency threshold — only visible when enabled */}
          {enabled && (
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-6 py-4">
              <div>
                <p className="text-sm font-medium text-foreground">Días de mora para reportar a Informconf</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  Al cruzar esta cantidad de días de mora, el cliente aparece en la lista de Morosos (Cobranzas) para gestionar su reporte a Informconf. Vacío = deshabilitado.
                </p>
              </div>
              {editingThreshold ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    autoFocus
                    type="number"
                    min="1"
                    step="1"
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') updateDelinquencyThreshold.mutate(thresholdInput ? Number(thresholdInput) : null);
                      if (e.key === 'Escape') setEditingThreshold(false);
                    }}
                    className="w-16 rounded-md border border-border py-1 px-2 text-sm focus:border-ring focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => updateDelinquencyThreshold.mutate(thresholdInput ? Number(thresholdInput) : null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingThreshold(false)}
                    className="text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setThresholdInput(config?.delinquencyThresholdDays != null ? String(config.delinquencyThresholdDays) : '');
                    setEditingThreshold(true);
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors"
                >
                  {config?.delinquencyThresholdDays != null ? `${config.delinquencyThresholdDays} día${config.delinquencyThresholdDays === 1 ? '' : 's'}` : 'Deshabilitado'}
                  <Pencil size={12} className="text-muted-foreground/60" />
                </button>
              )}
            </div>
          )}

          {/* Interest/mora components — only visible when enabled */}
          {enabled && (
            <div className="rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Componentes de interés y mora</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    Recargos que se suman a la cuota una vez vencida la tolerancia — podés combinar varios (ej. gastos administrativos + mora diaria) o usar solo uno.
                  </p>
                </div>
                {!showAddComponentForm && (
                  <button
                    type="button"
                    onClick={() => setShowAddComponentForm(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Plus size={14} />
                    Agregar
                  </button>
                )}
              </div>

              <div className="p-4 space-y-2">
                {showAddComponentForm && (
                  <AddComponentForm
                    onAdd={async (dto) => {
                      await addComponent.mutateAsync(dto);
                    }}
                    onCancel={() => setShowAddComponentForm(false)}
                  />
                )}

                {interestComponents.length === 0 && !showAddComponentForm ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-muted-foreground/60">No hay componentes configurados — no se cobra ningún recargo por mora.</p>
                    <button
                      type="button"
                      onClick={() => setShowAddComponentForm(true)}
                      className="mt-2 text-sm font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      Agrega el primero
                    </button>
                  </div>
                ) : (
                  interestComponents.map((component) => (
                    <ComponentRow
                      key={component.id}
                      component={component}
                      onToggle={(id, isActive) => updateComponent.mutate({ id, isActive })}
                      onDelete={(id) => {
                        if (confirm(`¿Eliminar el componente "${component.name}"?`)) {
                          removeComponent.mutate(id);
                        }
                      }}
                      onUpdateRate={(id, percentage) => updateComponent.mutate({ id, percentage })}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* Plans section — only visible when enabled */}
          {enabled && (
            <div className="rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Planes de financiamiento</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    El vendedor podrá seleccionar cualquiera de los planes activos al crear un pedido.
                  </p>
                </div>
                {!showAddForm && (
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Plus size={14} />
                    Agregar
                  </button>
                )}
              </div>

              <div className="p-4 space-y-2">
                {showAddForm && (
                  <AddPlanForm
                    existingInstallments={existingInstallments}
                    onAdd={async (installments, interestRate) => {
                      await addPlan.mutateAsync({ installments, interestRate });
                    }}
                    onCancel={() => setShowAddForm(false)}
                  />
                )}

                {plans.length === 0 && !showAddForm ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-muted-foreground/60">No hay planes configurados.</p>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(true)}
                      className="mt-2 text-sm font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      Agrega el primero
                    </button>
                  </div>
                ) : (
                  plans.map((plan) => (
                    <PlanRow
                      key={plan.id}
                      plan={plan}
                      onToggle={(id, isActive) => updatePlan.mutate({ id, isActive })}
                      onDelete={(id) => {
                        if (confirm(`¿Eliminar el plan de ${plan.installments} cuotas?`)) {
                          removePlan.mutate(id);
                        }
                      }}
                      onUpdateRate={(id, interestRate) => updatePlan.mutate({ id, interestRate })}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* Info banner when disabled */}
          {!enabled && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 dark:bg-amber-950/30 dark:border-amber-800/30">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Las ventas a crédito están deshabilitadas. Los pedidos solo pueden registrarse al contado.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
