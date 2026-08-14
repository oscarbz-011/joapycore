'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, Trash2, ToggleLeft, ToggleRight, Pencil, Check, X } from 'lucide-react';
import { settingsApi, type CreditPlan } from '../../../../../lib/api/settings';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRate(rate: number) {
  return `${Number(rate).toFixed(1)}%`;
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
  const QUICK_INSTALLMENTS = [3, 6, 12, 18, 24, 36];
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreditSettingsPage() {
  const qc = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['credit-config'],
    queryFn: settingsApi.getCredit,
  });

  const toggleEnabled = useMutation({
    mutationFn: (isEnabled: boolean) => settingsApi.setCreditEnabled(isEnabled),
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
