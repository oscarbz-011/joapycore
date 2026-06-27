'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Info, Save, Tag } from 'lucide-react';
import { settingsApi, type MarkupMethod } from '../../../../../lib/api/settings';

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
  const [markup, setMarkup] = useState('');
  const [previewCost, setPreviewCost] = useState('1000');
  const [flashSaved, setFlashSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setMethod(config.markupMethod);
      setMarkup(String(config.defaultMarkup));
    }
  }, [config]);

  const mutation = useMutation({
    mutationFn: () =>
      settingsApi.upsertPricing({ markupMethod: method, defaultMarkup: Number(markup) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pricing-config'] });
      setFlashSaved(true);
      setTimeout(() => setFlashSaved(false), 2500);
    },
  });

  function computedPrice(): number | null {
    const cost = Number(previewCost);
    const m = Number(markup);
    if (!cost || isNaN(m) || m <= 0) return null;
    return method === 'PERCENTAGE' ? cost * (1 + m / 100) : cost + m;
  }

  const price = computedPrice();
  const canSave = markup !== '' && Number(markup) > 0 && !mutation.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
          <Tag size={20} className="text-slate-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Configuración de Precios</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Define cómo se calcula el precio de venta sugerido a partir del costo de cada producto.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          {/* Método de margen */}
          <div className="p-6">
            <p className="mb-1 text-sm font-medium text-slate-700">Método de margen</p>
            <p className="mb-4 text-xs text-slate-400">
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
                      ? 'border-slate-800 bg-slate-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className={`text-sm font-semibold ${method === value ? 'text-slate-900' : 'text-slate-600'}`}>
                    {label}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">{example}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Margen por defecto */}
          <div className="p-6">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Margen por defecto
            </label>
            <p className="mb-3 text-xs text-slate-400">
              Se pre-completará al crear o actualizar un producto. Puede ajustarse por producto.
            </p>
            <div className="relative w-48">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                placeholder={method === 'PERCENTAGE' ? '25' : '5000'}
                className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-10 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                {method === 'PERCENTAGE' ? '%' : 'Gs.'}
              </span>
            </div>
          </div>

          {/* Preview */}
          <div className="p-6 bg-slate-50 rounded-b-2xl">
            <div className="flex items-center gap-1.5 mb-3">
              <Info size={13} className="text-slate-400" />
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Vista previa</p>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs text-slate-400 mb-1">Costo del producto</p>
                <div className="relative w-36">
                  <input
                    type="number"
                    min="1"
                    value={previewCost}
                    onChange={(e) => setPreviewCost(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-10 text-sm focus:border-slate-400 focus:outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Gs.</span>
                </div>
              </div>

              <div className="pt-5 text-slate-300">→</div>

              <div>
                <p className="text-xs text-slate-400 mb-1">Precio de venta sugerido</p>
                <div className="flex h-9 w-36 items-center rounded-lg border border-dashed border-slate-300 bg-white px-3">
                  {price !== null ? (
                    <span className="text-sm font-semibold text-slate-800">Gs. {fmt(price)}</span>
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
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
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
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
