'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Info, Save, Tag } from 'lucide-react';
import { settingsApi, type MarkupMethod } from '../../../../../lib/api/settings';
import { NumericInput } from '../../../../../components/numeric-input';

function fmt(n: number) {
  return n.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function PricingSettingsPage() {
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['pricing-config'],
    queryFn: settingsApi.getPricing,
  });

  const [method, setMethod] = useState<MarkupMethod>('PERCENTAGE');
  const [markup, setMarkup] = useState<number>(0);
  const [previewCost, setPreviewCost] = useState<number>(1000);
  const [flashSaved, setFlashSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setMethod(config.markupMethod);
      setMarkup(config.defaultMarkup);
    }
  }, [config]);

  const mutation = useMutation({
    mutationFn: () =>
      settingsApi.upsertPricing({ markupMethod: method, defaultMarkup: markup }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pricing-config'] });
      setFlashSaved(true);
      setTimeout(() => setFlashSaved(false), 2500);
    },
  });

  function computedPrice(): number | null {
    if (!previewCost || markup <= 0) return null;
    return method === 'PERCENTAGE' ? previewCost * (1 + markup / 100) : previewCost + markup;
  }

  const price = computedPrice();
  const canSave = markup > 0 && !mutation.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
          <Tag size={20} className="text-muted" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-ink">Configuración de Precios</h1>
          <p className="mt-0.5 text-sm text-muted">
            Define cómo se calcula el precio de venta sugerido a partir del costo de cada producto.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface divide-y divide-border">
          {/* Método de margen */}
          <div className="p-6">
            <p className="mb-1 text-sm font-medium text-muted">Método de margen</p>
            <p className="mb-4 text-xs text-faint">
              Elige si el margen se aplica como porcentaje sobre el costo o como un valor fijo.
            </p>
            <div className="flex gap-3">
              {([
                { value: 'PERCENTAGE', label: '% Porcentaje', example: 'Costo × (1 + margen%)' },
                { value: 'FIXED',      label: '+ Valor fijo', example: 'Costo + margen' },
              ] as const).map(({ value, label, example }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMethod(value)}
                  className={`flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                    method === value
                      ? 'border-ink bg-surface-2'
                      : 'border-border hover:border-border-strong'
                  }`}
                >
                  <p className={`text-sm font-semibold ${method === value ? 'text-ink' : 'text-muted'}`}>
                    {label}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-faint">{example}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Margen por defecto */}
          <div className="p-6">
            <label className="mb-1 block text-sm font-medium text-muted">
              Margen por defecto
            </label>
            <p className="mb-3 text-xs text-faint">
              Se pre-completará al crear o actualizar un producto. Puede ajustarse por producto.
            </p>
            <div className="relative w-48">
              <NumericInput
                value={markup}
                onChange={setMarkup}
                decimals={method === 'PERCENTAGE' ? 2 : 0}
                placeholder={method === 'PERCENTAGE' ? '25' : '5000'}
                className="w-full rounded-lg border border-border-strong py-2 pl-3 pr-10 text-sm focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-faint">
                {method === 'PERCENTAGE' ? '%' : 'Gs.'}
              </span>
            </div>
          </div>

          {/* Preview */}
          <div className="p-6 bg-surface-2 rounded-b-2xl">
            <div className="flex items-center gap-1.5 mb-3">
              <Info size={13} className="text-faint" />
              <p className="text-xs font-medium text-muted uppercase tracking-wider">Vista previa</p>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs text-faint mb-1">Costo del producto</p>
                <div className="relative w-36">
                  <NumericInput
                    value={previewCost}
                    onChange={setPreviewCost}
                    className="w-full rounded-lg border border-border bg-surface py-2 pl-3 pr-10 text-sm focus:border-border-strong focus:outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">Gs.</span>
                </div>
              </div>

              <div className="pt-5 text-faint">→</div>

              <div>
                <p className="text-xs text-faint mb-1">Precio de venta sugerido</p>
                <div className="flex h-9 w-36 items-center rounded-lg border border-dashed border-border-strong bg-surface px-3">
                  {price !== null ? (
                    <span className="text-sm font-semibold text-ink">Gs. {fmt(price)}</span>
                  ) : (
                    <span className="text-sm text-faint">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => mutation.mutate()}
          className="flex items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {flashSaved ? <Check size={15} /> : <Save size={15} />}
          {flashSaved ? 'Guardado' : mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>

        {mutation.isError && (
          <p className="text-sm text-red-500">Error al guardar. Intentá de nuevo.</p>
        )}
      </div>
    </div>
  );
}
