'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil } from 'lucide-react';
import { NumericInput } from '@/components/numeric-input';
import { SortableHeader } from '@/components/sortable-header';
import { UnitSelect } from '@/components/inventory/unit-select';
import { presentationsQueryKey } from '@/components/sales/sale-unit-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api/api-error';
import { inventoryApi, type ProductPresentation } from '@/lib/api/inventory';
import { DIMENSION_LABEL, factorText, measureOf } from '@/lib/dimensions';
import { usePermission } from '@/lib/permissions';
import {
  emptyPresentationForm,
  formFactor,
  presentationFormError,
  presentationPayload,
  presentationToForm,
  suggestedPrice,
  type PresentationForm,
} from '@/lib/presentations';
import { formatQty } from '@/lib/quantity';
import type { SortValue } from '@/lib/table-sort';
import { unitOfMeasure, unitSymbol } from '@/lib/units-of-measure';
import { useTableSort } from '@/lib/use-table-sort';
import { cn } from '@/lib/utils';

const NUM_CLS =
  'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

function fmtGs(n: number) {
  return 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
}

type SortKey = 'name' | 'factor' | 'unit' | 'price' | 'perUnit' | 'status';

const SORT: Record<SortKey, (p: ProductPresentation) => SortValue> = {
  name: (p) => p.name,
  factor: (p) => p.factor,
  unit: (p) => unitSymbol(p.unitCode),
  price: (p) => p.salePrice,
  perUnit: (p) => p.salePrice / p.factor,
  status: (p) => (p.isActive ? 0 : 1),
};

/**
 * Otras formas de vender el producto. El stock sigue en la unidad del
 * producto: cada presentación dice cuánto lleva de ella.
 */
export function PresentationsTab({
  productId,
  unitCode,
  basePrice,
}: {
  productId: string;
  unitCode: number;
  basePrice: number | null;
}) {
  const canUpdate = usePermission('inventory:products:update');
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PresentationForm>(emptyPresentationForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { data: presentations = [], isLoading, isError } = useQuery({
    queryKey: presentationsQueryKey(productId),
    queryFn: () => inventoryApi.getPresentations(productId),
  });
  const { sorted, sort, toggle } = useTableSort(presentations, SORT);

  const measure = measureOf(unitCode);
  const baseSymbol = unitSymbol(unitCode);
  const factor = formFactor(form, unitCode);
  const suggested = suggestedPrice(basePrice, factor);

  const reset = () => {
    setForm(emptyPresentationForm());
    setEditingId(null);
    setError('');
  };
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: presentationsQueryKey(productId) });

  const save = useMutation({
    mutationFn: () => {
      const payload = presentationPayload(form, unitCode);
      return editingId
        ? inventoryApi.updatePresentation(productId, editingId, payload)
        : inventoryApi.addPresentation(productId, payload);
    },
    onSuccess: () => {
      reset();
      void invalidate();
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo guardar la presentación')),
  });

  const setActive = useMutation({
    mutationFn: (p: ProductPresentation) =>
      inventoryApi.updatePresentation(productId, p.id, { isActive: !p.isActive }),
    onSuccess: () => void invalidate(),
  });

  const submit = () => {
    const problem = presentationFormError(form, unitCode);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    save.mutate();
  };

  const set = <K extends keyof PresentationForm>(key: K, value: PresentationForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/30" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        No se pudieron cargar las presentaciones. Actualizá la página para intentar de nuevo.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {presentations.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-6 text-center">
          <Layers size={20} className="mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">
            Se vende solo por {baseSymbol}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {measure
              ? 'Agregá presentaciones con sus medidas (una plancha entera, un rollo). Los cortes a medida se cargan al vender.'
              : 'Agregá presentaciones como un pack o una caja con su propio precio.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground/60">
                  <SortableHeader label="Presentación" sortKey="name" sort={sort} onSort={toggle} />
                  <SortableHeader label={`Lleva (${baseSymbol})`} sortKey="factor" sort={sort} onSort={toggle} align="right" />
                  <SortableHeader label="Se factura en" sortKey="unit" sort={sort} onSort={toggle} />
                  <SortableHeader label="Precio" sortKey="price" sort={sort} onSort={toggle} align="right" />
                  <SortableHeader label={`Por ${baseSymbol}`} sortKey="perUnit" sort={sort} onSort={toggle} align="right" />
                  <SortableHeader label="Estado" sortKey="status" sort={sort} onSort={toggle} />
                  {canUpdate && <th className="px-4 py-3" aria-label="Acciones" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((p) => (
                  <tr key={p.id} className={cn('transition-colors hover:bg-muted/20', !p.isActive && 'opacity-60')}>
                    <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatQty(p.factor, 8)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{unitSymbol(p.unitCode)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtGs(p.salePrice)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {fmtGs(p.salePrice / p.factor)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.isActive ? 'Activa' : 'Desactivada'}
                    </td>
                    {canUpdate && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title={`Editar ${p.name}`}
                          aria-label={`Editar ${p.name}`}
                          onClick={() => {
                            setEditingId(p.id);
                            setForm(presentationToForm(p));
                            setError('');
                          }}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={setActive.isPending}
                          onClick={() => setActive.mutate(p)}
                        >
                          {p.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canUpdate && (
        <form
          className="space-y-3 rounded-xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <p className="text-xs font-semibold text-muted-foreground">
            {editingId ? 'Editar presentación' : 'Agregar presentación'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="presentation-name">Nombre</Label>
              <Input
                id="presentation-name"
                value={form.name}
                maxLength={80}
                onChange={(e) => set('name', e.target.value)}
                placeholder={measure ? 'Plancha entera' : 'Pack de 6'}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="presentation-unit">Se factura en</Label>
              <UnitSelect id="presentation-unit" value={form.unitCode} onChange={(code) => set('unitCode', code)} />
            </div>
          </div>

          {measure ? (
            <div className="flex flex-wrap items-end gap-3">
              {measure.dimensions.map((d) => (
                <div key={d} className="w-28 space-y-1">
                  <Label htmlFor={`presentation-${d}`}>
                    {DIMENSION_LABEL[d]} ({measure.linearSymbol})
                  </Label>
                  <NumericInput
                    id={`presentation-${d}`}
                    value={form[d]}
                    onChange={(v) => set(d, Math.max(0, v))}
                    decimals={3}
                    className={NUM_CLS}
                  />
                </div>
              ))}
              <p className="pb-2 text-xs text-muted-foreground">
                {factor ? `= ${factorText(factor.toString(), unitCode)}` : 'Cargá las medidas'}
              </p>
            </div>
          ) : (
            <div className="w-40 space-y-1">
              <Label htmlFor="presentation-factor">Cuántos {baseSymbol} lleva</Label>
              <NumericInput
                id="presentation-factor"
                value={form.factor}
                onChange={(v) => set('factor', Math.max(0, v))}
                decimals={unitOfMeasure(unitCode).decimals}
                className={NUM_CLS}
              />
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44 space-y-1">
              <Label htmlFor="presentation-price">Precio</Label>
              <NumericInput
                id="presentation-price"
                value={form.salePrice}
                onChange={(v) => set('salePrice', Math.max(0, v))}
                className={NUM_CLS}
              />
            </div>
            {suggested != null && suggested !== form.salePrice && (
              <Button type="button" variant="ghost" size="sm" onClick={() => set('salePrice', suggested)}>
                Usar {fmtGs(suggested)} (precio por {baseSymbol} × lo que lleva)
              </Button>
            )}
          </div>

          {error && (
            <p role="alert" className="text-[12.5px] text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar presentación'}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
