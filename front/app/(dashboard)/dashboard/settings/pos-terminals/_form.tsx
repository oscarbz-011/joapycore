'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { billingApi } from '@/lib/api/billing';
import { filesApi } from '@/lib/api/files';
import { posApi, type PosPrintFormat, type PosTerminal } from '@/lib/api/pos';
import { seriesLabel } from '@/lib/billing-series';
import { PRINT_FORMAT_LABELS, isThermal, thermalProblem } from '@/lib/pos-receipt';
import {
  invoicingFormProblem,
  seriesForTerminal,
  terminalToInvoicingForm,
  type TerminalInvoicingForm,
} from '@/lib/pos-terminal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const FORMATS: PosPrintFormat[] = ['A4', 'HALF_LETTER', 'THERMAL_80', 'THERMAL_58'];
const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';

export function PosTerminalForm({ terminal, onDone }: Readonly<{ terminal: PosTerminal; onDone: () => void }>) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(terminal.name);
  const [isActive, setIsActive] = useState(terminal.isActive);
  const [form, setForm] = useState<TerminalInvoicingForm>(() => terminalToInvoicingForm(terminal));
  const [reportName, setReportName] = useState(terminal.thermalPaperReport?.originalName ?? null);
  const [error, setError] = useState('');

  const seriesQuery = useQuery({ queryKey: ['billing-series'], queryFn: billingApi.listSeries });
  const options = seriesForTerminal(seriesQuery.data ?? [], terminal.branchId);
  const selectedSeries = options.find((s) => s.id === form.invoiceSeriesId);

  function set<K extends keyof TerminalInvoicingForm>(key: K, value: TerminalInvoicingForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const upload = useMutation({
    mutationFn: (file: File) =>
      filesApi.upload(file, { module: 'pos', entityType: 'PosTerminal', entityId: terminal.id }),
    onSuccess: (record) => {
      set('thermalPaperReportFileId', record.id);
      setReportName(record.originalName);
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo subir el informe')),
  });

  const save = useMutation({
    mutationFn: () =>
      posApi.updateTerminal(terminal.id, {
        name: name.trim(),
        isActive,
        invoiceSeriesId: form.invoiceSeriesId,
        printFormat: form.printFormat,
        thermalPaperReportFileId: form.thermalPaperReportFileId,
        thermalPaperConservation: form.thermalPaperConservation.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pos-terminals'] });
      await queryClient.invalidateQueries({ queryKey: ['pos-active-session'] });
      onDone();
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo guardar la caja')),
  });

  const problem = invoicingFormProblem(form);
  const thermalMissing = thermalProblem(form);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        save.mutate();
      }}
    >
      <Card className="divide-y divide-border p-0">
        <section className="space-y-4 p-6">
          <p className={SECTION_LABEL}>Caja</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="terminal-name">Nombre *</Label>
              <Input id="terminal-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terminal-branch">Sucursal</Label>
              <Input id="terminal-branch" value={terminal.branch.name} disabled />
            </div>
          </div>
        </section>

        <section className="space-y-4 p-6">
          <p className={SECTION_LABEL}>Facturación</p>
          <div className="space-y-1.5">
            <Label>Serie de facturas</Label>
            {seriesQuery.isLoading ? (
              <div className="h-9 animate-pulse rounded-lg bg-muted/30" />
            ) : seriesQuery.error ? (
              <p role="alert" className="text-sm text-destructive">
                {apiErrorMessage(seriesQuery.error, 'No se pudieron cargar las series de facturación')}
              </p>
            ) : options.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                La sucursal {terminal.branch.name} no tiene series de facturas activas. Cargá una en Ajustes → Series y timbrados.
              </p>
            ) : (
              <Select
                value={form.invoiceSeriesId ?? 'none'}
                onValueChange={(v) => set('invoiceSeriesId', v && v !== 'none' ? v : null)}
              >
                <SelectTrigger className="w-full" aria-label="Serie de facturas">
                  <span className="flex-1 truncate text-left text-sm">
                    {selectedSeries ? seriesLabel(selectedSeries) : 'Sin serie (la caja no puede cobrar)'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin serie (la caja no puede cobrar)</SelectItem>
                  {options.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {seriesLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              Con talonario de imprenta el cajero escribe el número de la hoja que entrega; con impresión propia el
              sistema numera e imprime la factura.
            </p>
          </div>
        </section>

        <section className="space-y-4 p-6">
          <p className={SECTION_LABEL}>Impresión</p>
          <div className="space-y-1.5">
            <Label>Formato de la factura</Label>
            <Select value={form.printFormat} onValueChange={(v) => v && set('printFormat', v as PosPrintFormat)}>
              <SelectTrigger className="w-full md:w-80" aria-label="Formato de la factura">
                <span className="flex-1 truncate text-left text-sm">{PRINT_FORMAT_LABELS[form.printFormat]}</span>
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((format) => (
                  <SelectItem key={format} value={format} disabled={isThermal(format) && thermalMissing !== null}>
                    {PRINT_FORMAT_LABELS[format]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {thermalMissing && (
              <p className="text-xs text-muted-foreground">
                El papel térmico se habilita al cargar el informe de durabilidad del papel y sus condiciones de
                conservación (RG 27/19).
              </p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="paper-report">Informe de durabilidad del papel térmico</Label>
              {reportName && (
                <p className="flex items-center gap-1.5 text-sm text-foreground">
                  <FileCheck2 size={15} className="text-primary" /> {reportName}
                </p>
              )}
              <Input
                id="paper-report"
                type="file"
                accept="application/pdf,image/*"
                disabled={upload.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload.mutate(file);
                  e.target.value = '';
                }}
              />
              <p className="text-xs text-muted-foreground">
                {upload.isPending ? 'Subiendo…' : 'El informe del proveedor que garantiza que la impresión dura al menos 5 años.'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paper-conservation">Condiciones de conservación</Label>
              <Textarea
                id="paper-conservation"
                rows={3}
                maxLength={300}
                value={form.thermalPaperConservation}
                onChange={(e) => set('thermalPaperConservation', e.target.value)}
                placeholder="Conservar en lugar fresco y seco, lejos del calor, la luz solar y el contacto con plásticos."
              />
              <p className="text-xs text-muted-foreground">Se imprimen al pie de cada factura en papel térmico.</p>
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 p-6">
          <div className="flex items-center gap-2">
            <Checkbox id="terminal-active" checked={isActive} onCheckedChange={(checked) => setIsActive(checked)} />
            <Label htmlFor="terminal-active">Caja activa</Label>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onDone}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending || upload.isPending || !name.trim() || problem !== null}>
              {save.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </section>

        {(error || problem) && (
          <div className="p-6 pt-0">
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error || problem}
            </div>
          </div>
        )}
      </Card>
    </form>
  );
}
