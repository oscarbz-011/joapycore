'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '@/lib/api/api-error';
import { branchesApi } from '@/lib/api/branches';
import { billingApi, type BillingModality, type BillingSeries } from '@/lib/api/billing';
import {
  emptySeriesForm,
  formToPayload,
  lockedFields,
  MODALITY_LABELS,
  SELECTABLE_MODALITIES,
  seriesToForm,
  validateSeriesForm,
  type SeriesForm,
  type SeriesFormErrors,
} from '@/lib/billing-series';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

const MODALITY_HELP: Record<BillingModality, string> = {
  PREPRINTED:
    'El comprobante es la hoja del talonario: al facturar se carga su número y el sistema imprime solo una copia interna.',
  SELF_PRINTED:
    'Timbrado de autoimpresor: el sistema asigna el número y la factura que imprime es el comprobante.',
  ELECTRONIC: '',
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function BillingSeriesForm({
  series,
  canManage,
  onDone,
}: {
  series?: BillingSeries;
  canManage: boolean;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SeriesForm>(() =>
    series ? seriesToForm(series) : emptySeriesForm(),
  );
  const [isActive, setIsActive] = useState(series?.isActive ?? true);
  const [errors, setErrors] = useState<SeriesFormErrors>({});
  const [error, setError] = useState('');
  const locked = lockedFields(series);
  const used = (series?._count.invoices ?? 0) > 0;

  const { data: branches = [], isLoading: loadingBranches } = useQuery({
    queryKey: ['branches'],
    queryFn: branchesApi.listBranches,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = formToPayload(form);
      if (!series) return billingApi.createSeries(payload);
      const editable = Object.fromEntries(
        Object.entries(payload).filter(
          ([key]) => !locked.has(key as keyof SeriesForm),
        ),
      );
      return billingApi.updateSeries(series.id, { ...editable, isActive });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['billing-series'] });
      onDone();
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo guardar la serie')),
  });

  function set<K extends keyof SeriesForm>(key: K, value: SeriesForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const found = validateSeriesForm(form);
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  }

  const disabled = (field: keyof SeriesForm) => !canManage || locked.has(field);
  const branchName = branches.find((b) => b.id === form.branchId)?.name;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {used && (
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Esta serie ya numeró {series?._count.invoices} factura(s): solo se puede cambiar el fin de vigencia,
          el fin del rango y si está activa. Para un timbrado nuevo, creá otra serie.
        </div>
      )}

      <Card className="space-y-5 p-6">
        <h2 className="text-sm font-semibold text-foreground">Timbrado</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="series-branch">Sucursal <span className="text-destructive">*</span></Label>
            <Select
              value={form.branchId || 'none'}
              onValueChange={(v) => set('branchId', v && v !== 'none' ? v : '')}
              disabled={disabled('branchId') || loadingBranches}
            >
              <SelectTrigger id="series-branch" className="w-full">
                <span className="flex-1 truncate text-left text-sm">
                  {branchName ?? (loadingBranches ? 'Cargando…' : '— Seleccionar —')}
                </span>
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={errors.branchId} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="series-modality">Modalidad <span className="text-destructive">*</span></Label>
            <Select
              value={form.modality}
              onValueChange={(v) => v && set('modality', v as BillingModality)}
              disabled={disabled('modality')}
            >
              <SelectTrigger id="series-modality" className="w-full">
                <span className="flex-1 truncate text-left text-sm">{MODALITY_LABELS[form.modality]}</span>
              </SelectTrigger>
              <SelectContent>
                {SELECTABLE_MODALITIES.map((m) => (
                  <SelectItem key={m} value={m}>{MODALITY_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{MODALITY_HELP[form.modality]}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="series-timbrado">Número de timbrado <span className="text-destructive">*</span></Label>
            <Input
              id="series-timbrado"
              inputMode="numeric"
              maxLength={8}
              value={form.timbrado}
              onChange={(e) => set('timbrado', e.target.value.replace(/\D/g, ''))}
              disabled={disabled('timbrado')}
              placeholder="12345678"
              aria-invalid={Boolean(errors.timbrado)}
            />
            <FieldError message={errors.timbrado} />
          </div>

          <div />

          <div className="space-y-1.5">
            <Label htmlFor="series-valid-from">Inicio de vigencia <span className="text-destructive">*</span></Label>
            <Input
              id="series-valid-from"
              type="date"
              value={form.validFrom}
              onChange={(e) => set('validFrom', e.target.value)}
              disabled={disabled('validFrom')}
              aria-invalid={Boolean(errors.validFrom)}
            />
            <FieldError message={errors.validFrom} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="series-valid-until">Fin de vigencia <span className="text-destructive">*</span></Label>
            <Input
              id="series-valid-until"
              type="date"
              value={form.validUntil}
              onChange={(e) => set('validUntil', e.target.value)}
              disabled={disabled('validUntil')}
              aria-invalid={Boolean(errors.validUntil)}
            />
            <FieldError message={errors.validUntil} />
          </div>
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <h2 className="text-sm font-semibold text-foreground">Numeración</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="series-est">Establecimiento <span className="text-destructive">*</span></Label>
            <Input
              id="series-est"
              inputMode="numeric"
              maxLength={3}
              value={form.establecimiento}
              onChange={(e) => set('establecimiento', e.target.value.replace(/\D/g, ''))}
              disabled={disabled('establecimiento')}
              aria-invalid={Boolean(errors.establecimiento)}
            />
            <FieldError message={errors.establecimiento} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="series-point">Punto de expedición <span className="text-destructive">*</span></Label>
            <Input
              id="series-point"
              inputMode="numeric"
              maxLength={3}
              value={form.puntoExpedicion}
              onChange={(e) => set('puntoExpedicion', e.target.value.replace(/\D/g, ''))}
              disabled={disabled('puntoExpedicion')}
              aria-invalid={Boolean(errors.puntoExpedicion)}
            />
            <FieldError message={errors.puntoExpedicion} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="series-from">Rango desde <span className="text-destructive">*</span></Label>
            <Input
              id="series-from"
              inputMode="numeric"
              value={form.rangeFrom}
              onChange={(e) => set('rangeFrom', e.target.value.replace(/\D/g, ''))}
              disabled={disabled('rangeFrom')}
              aria-invalid={Boolean(errors.rangeFrom)}
            />
            <FieldError message={errors.rangeFrom} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="series-to">Rango hasta <span className="text-destructive">*</span></Label>
            <Input
              id="series-to"
              inputMode="numeric"
              value={form.rangeTo}
              onChange={(e) => set('rangeTo', e.target.value.replace(/\D/g, ''))}
              disabled={disabled('rangeTo')}
              aria-invalid={Boolean(errors.rangeTo)}
            />
            <FieldError message={errors.rangeTo} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="series-next">
              {form.modality === 'PREPRINTED' ? 'Próximo número del talonario' : 'Próximo número'}
            </Label>
            <Input
              id="series-next"
              inputMode="numeric"
              value={form.nextNumber}
              onChange={(e) => set('nextNumber', e.target.value.replace(/\D/g, ''))}
              disabled={disabled('nextNumber')}
              placeholder={form.rangeFrom || '1'}
              aria-invalid={Boolean(errors.nextNumber)}
            />
            <p className="text-xs text-muted-foreground">Vacío: arranca en el inicio del rango.</p>
            <FieldError message={errors.nextNumber} />
          </div>
          {series && (
            <div className="space-y-1.5">
              <Label htmlFor="series-active">Estado</Label>
              <Select
                value={isActive ? 'active' : 'inactive'}
                onValueChange={(v) => setIsActive(v === 'active')}
                disabled={!canManage}
              >
                <SelectTrigger id="series-active" className="w-full">
                  <span className="flex-1 truncate text-left text-sm">{isActive ? 'Activa' : 'Desactivada'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activa</SelectItem>
                  <SelectItem value="inactive">Desactivada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </Card>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        {canManage && (
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : series ? 'Guardar cambios' : 'Crear serie'}
          </Button>
        )}
      </div>
    </form>
  );
}
