'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { billingApi, type BillingSeries, type PreprintedLayout } from '@/lib/api/billing';
import { ITEM_FIELDS, POINT_FIELDS, SHEET_FIELDS, layoutProblem } from '@/lib/preprinted-layout-fields';
import { printPreprintedForm, sampleFiscalReceipt } from '@/lib/preprinted-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';

function NumberField({
  id,
  label,
  value,
  step = 0.5,
  disabled,
  onChange,
}: Readonly<{ id: string; label: string; value: number; step?: number; disabled: boolean; onChange: (n: number) => void }>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      />
    </div>
  );
}

/** Dónde imprimir cada dato sobre la hoja del talonario de la serie. */
export function PreprintedLayoutEditor({
  series,
  canManage,
}: Readonly<{ series: BillingSeries; canManage: boolean }>) {
  const queryClient = useQueryClient();
  const [layout, setLayout] = useState<PreprintedLayout>(series.printLayout);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const problem = layoutProblem(layout);
  const disabled = !canManage;

  const save = useMutation({
    mutationFn: (value: PreprintedLayout | null) => billingApi.updateSeries(series.id, { printLayout: value }),
    onSuccess: async (updated) => {
      setLayout(updated.printLayout);
      setMessage('Diseño guardado.');
      await queryClient.invalidateQueries({ queryKey: ['billing-series'] });
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo guardar el diseño')),
  });

  const setSheet = (key: (typeof SHEET_FIELDS)[number]['key'], n: number) =>
    setLayout((l) => ({ ...l, [key]: n }));
  const setItem = (key: (typeof ITEM_FIELDS)[number]['key'], n: number) =>
    setLayout((l) => ({ ...l, items: { ...l.items, [key]: n } }));
  const setPoint = (key: (typeof POINT_FIELDS)[number]['fields'][number]['key'], axis: 'x' | 'y', n: number) =>
    setLayout((l) => ({ ...l, [key]: { ...l[key], [axis]: n } }));

  return (
    <Card className="mt-6 divide-y divide-border p-0">
      <section className="space-y-2 p-6">
        <p className={SECTION_LABEL}>Diseño de impresión sobre la hoja</p>
        <p className="text-sm text-muted-foreground">
          Medidas en milímetros desde el borde superior izquierdo de la hoja. Usá &quot;Imprimir prueba&quot; sobre una hoja
          en blanco del mismo tamaño, superponela a una hoja del talonario y corregí las posiciones o el corrimiento.
        </p>
      </section>

      <section className="space-y-3 p-6">
        <p className={SECTION_LABEL}>Hoja</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {SHEET_FIELDS.map((field) => (
            <NumberField
              key={field.key}
              id={`layout-${field.key}`}
              label={`${field.label} (${field.unit})`}
              value={layout[field.key]}
              disabled={disabled}
              onChange={(n) => setSheet(field.key, n)}
            />
          ))}
        </div>
      </section>

      {POINT_FIELDS.map((group) => (
        <section key={group.title} className="space-y-3 p-6">
          <p className={SECTION_LABEL}>{group.title}</p>
          <div className="grid grid-cols-[1fr_6rem_6rem] items-end gap-x-3 gap-y-2">
            <span className="text-xs text-muted-foreground">Dato</span>
            <span className="text-xs text-muted-foreground">X (mm)</span>
            <span className="text-xs text-muted-foreground">Y (mm)</span>
            {group.fields.map((field) => (
              <div key={field.key} className="contents">
                <span className="pb-2 text-sm text-foreground">{field.label}</span>
                <Input
                  type="number"
                  step={0.5}
                  aria-label={`${field.label}: X`}
                  value={Number.isFinite(layout[field.key].x) ? layout[field.key].x : ''}
                  disabled={disabled}
                  onChange={(e) => setPoint(field.key, 'x', e.target.value === '' ? Number.NaN : Number(e.target.value))}
                />
                <Input
                  type="number"
                  step={0.5}
                  aria-label={`${field.label}: Y`}
                  value={Number.isFinite(layout[field.key].y) ? layout[field.key].y : ''}
                  disabled={disabled}
                  onChange={(e) => setPoint(field.key, 'y', e.target.value === '' ? Number.NaN : Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-3 p-6">
        <p className={SECTION_LABEL}>Detalle de ítems (mm)</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {ITEM_FIELDS.map((field) => (
            <NumberField
              key={field.key}
              id={`layout-items-${field.key}`}
              label={field.label}
              value={layout.items[field.key]}
              step={field.step}
              disabled={disabled}
              onChange={(n) => setItem(field.key, n)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 p-6">
        <Button
          type="button"
          variant="outline"
          disabled={problem !== null}
          onClick={() => printPreprintedForm(sampleFiscalReceipt(), layout)}
        >
          <Printer size={15} /> Imprimir prueba
        </Button>
        {canManage && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => {
                setError('');
                setMessage('');
                save.mutate(null);
              }}
            >
              Volver al diseño estándar
            </Button>
            <Button
              type="button"
              disabled={save.isPending || problem !== null}
              onClick={() => {
                setError('');
                setMessage('');
                save.mutate(layout);
              }}
            >
              {save.isPending ? 'Guardando…' : 'Guardar diseño'}
            </Button>
          </div>
        )}
      </section>

      {(problem || error || message) && (
        <div className="p-6 pt-4">
          <p role={problem || error ? 'alert' : 'status'} className={`text-sm ${problem || error ? 'text-destructive' : 'text-foreground'}`}>
            {problem || error || message}
          </p>
        </div>
      )}
    </Card>
  );
}
