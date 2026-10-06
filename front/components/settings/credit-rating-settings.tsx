'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api/api-error';
import { settingsApi, type CreditConfig } from '@/lib/api/settings';
import {
  SCORE_LABELS,
  ratingRanges,
  thresholdsError,
} from '@/lib/credit-score';
import type { CreditScore } from '@/lib/api/sales';

const LEVELS: CreditScore[] = [1, 2, 3, 4, 5];

/**
 * Rangos de la calificación del cliente (1 a 5 por atraso promedio) y días a
 * partir de los cuales pasa solo a nivel 6 (incobrable/judicial).
 */
export function CreditRatingSettings({ config }: { config: CreditConfig }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [limits, setLimits] = useState<string[]>([]);
  const [uncollectibleDays, setUncollectibleDays] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (input: { thresholds: number[]; days: number | null }) =>
      settingsApi.updateCreditRating(
        config.isEnabled,
        input.thresholds,
        input.days,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['credit-config'] });
      setEditing(false);
    },
    onError: (err) =>
      setError(apiErrorMessage(err, 'No se pudo guardar la calificación')),
  });

  const startEditing = () => {
    setLimits(config.ratingDelayThresholds.map(String));
    setUncollectibleDays(
      config.uncollectibleAfterDays != null
        ? String(config.uncollectibleAfterDays)
        : '',
    );
    setError('');
    setEditing(true);
  };

  const save = () => {
    const thresholds = limits.map((value) =>
      value.trim() === '' ? NaN : Number(value),
    );
    const invalid = thresholdsError(thresholds);
    if (invalid) return setError(invalid);
    const days = uncollectibleDays.trim() === '' ? null : Number(uncollectibleDays);
    if (days !== null && (!Number.isInteger(days) || days < 1)) {
      return setError(
        'Los días para incobrable deben ser un número entero mayor a cero',
      );
    }
    setError('');
    mutation.mutate({ thresholds, days });
  };

  const ranges = ratingRanges(config.ratingDelayThresholds);

  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            Calificación del cliente
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/60">
            Se calcula sola con el promedio de días de atraso de todas las
            cuotas del cliente: 1 es el que paga al día y 5 el que más se
            atrasa. El nivel 6 (incobrable/judicial) bloquea la aprobación de
            un crédito nuevo.
          </p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Pencil />
            Editar
          </Button>
        )}
      </div>

      {editing ? (
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-4">
            {limits.map((value, index) => (
              <div key={LEVELS[index]} className="space-y-1.5">
                <Label htmlFor={`rating-limit-${index}`}>
                  Nivel {LEVELS[index]}: hasta (días)
                </Label>
                <Input
                  id={`rating-limit-${index}`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={value}
                  onChange={(event) =>
                    setLimits((current) =>
                      current.map((item, i) =>
                        i === index ? event.target.value : item,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/60">
            El nivel 5 es todo lo que supere el límite del nivel 4.
          </p>

          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="uncollectible-days">
              Días de atraso para pasar a incobrable (nivel 6)
            </Label>
            <Input
              id="uncollectible-days"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="Vacío = solo por marca manual"
              value={uncollectibleDays}
              onChange={(event) => setUncollectibleDays(event.target.value)}
            />
            <p className="text-xs text-muted-foreground/60">
              Mientras una cuota impaga supere estos días, el cliente queda en
              nivel 6. Vuelve a su nivel cuando la regulariza.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {LEVELS.map((level, index) => (
            <div key={level} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {level} · {SCORE_LABELS[level]}
              </dt>
              <dd className="text-foreground">{ranges[index]}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">6 · {SCORE_LABELS[6]}</dt>
            <dd className="text-foreground">
              {config.uncollectibleAfterDays != null
                ? `Cuota impaga con más de ${config.uncollectibleAfterDays} días, o marca manual`
                : 'Solo por marca manual'}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
