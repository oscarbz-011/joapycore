'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api/api-error';
import { settingsApi, type SalesConfig } from '@/lib/api/settings';
import { usePermission } from '@/lib/permissions';

/** Texto del estado: de dónde sale lo que está activo. */
export function presentationsStatus(config: Pick<SalesConfig, 'presentationsEnabled' | 'presentationsChosen'>) {
  const state = config.presentationsEnabled ? 'Activado' : 'Desactivado';
  return config.presentationsChosen == null ? `${state} según el rubro de la empresa` : `${state} por la empresa`;
}

/**
 * Vender en presentaciones y cortes a medida. Si la empresa no lo eligió,
 * sigue a su rubro (ferretería, mueblería y supermercado lo traen activo).
 */
export function PresentationsSetting({ config }: { config: SalesConfig }) {
  const canToggle = usePermission('tenants:update');
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: (value: boolean | null) => settingsApi.setPresentationsEnabled(value),
    onSuccess: (updated) => {
      setError('');
      qc.setQueryData(['sales-config'], updated);
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo guardar el cambio')),
  });
  const enabled = config.presentationsEnabled;

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p id="presentations-setting" className="text-sm font-medium text-foreground">
            Presentaciones y cortes a medida
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/60">
            Vender un producto por rollo, plancha o pack con su propio precio, o cortarlo a medida. El
            stock sigue en la unidad del producto.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{presentationsStatus(config)}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="presentations-setting"
          disabled={!canToggle || save.isPending}
          title={canToggle ? undefined : 'Requiere permiso para modificar la configuración de la empresa'}
          onClick={() => save.mutate(!enabled)}
          className={`relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${enabled ? 'bg-emerald-500' : 'bg-muted/50'} disabled:opacity-50`}
        >
          <span
            className={`absolute left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>
      {canToggle && config.presentationsChosen != null && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={save.isPending}
          onClick={() => save.mutate(null)}
          className="-ml-2"
        >
          Volver a lo que trae el rubro
        </Button>
      )}
      {error && (
        <p role="alert" className="text-[12.5px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
