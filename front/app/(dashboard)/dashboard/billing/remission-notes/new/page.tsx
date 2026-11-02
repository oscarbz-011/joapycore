'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import {
  type IssueTransferPayload,
  remissionNotesApi,
  type TransferOptions,
} from '@/lib/api/remission-notes';
import {
  defaultSeriesId,
  documentNumberError,
  needsDocumentNumber,
  usableOptions,
} from '@/lib/billing-series';
import {
  emptyRemissionDraft,
  type GoodsDraftLine,
  lineQuantity,
  type RemissionDraft,
  remissionDraftProblem,
  remissionPayloadBase,
  todayInParaguay,
  transferLinesProblem,
  transferPayloadItems,
} from '@/lib/remission-notes';
import { RequirePermission } from '@/components/require-permission';
import { RemissionTransportFields } from '@/components/billing/remission-transport-fields';
import { SeriesNumberingFields } from '@/components/billing/series-numbering-fields';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';

type WarehouseOption = TransferOptions['warehouses'][number];

const warehouseLabel = (w: WarehouseOption | undefined) =>
  w ? (w.branch ? `${w.name} · ${w.branch.name}` : w.name) : '';

function WarehouseSelect({
  id,
  label,
  value,
  options,
  exclude,
  onChange,
  disabled,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  options: WarehouseOption[];
  exclude?: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}>) {
  const selected = options.find((w) => w.id === value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} <span className="text-destructive">*</span>
      </Label>
      <Select value={value || 'none'} onValueChange={(v) => v && v !== 'none' && onChange(v)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <span className="flex-1 truncate text-left text-sm">
            {selected ? warehouseLabel(selected) : 'Elegí un depósito'}
          </span>
        </SelectTrigger>
        <SelectContent>
          {options
            .filter((w) => w.id !== exclude)
            .map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {warehouseLabel(w)}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// useSearchParams necesita un límite de Suspense para compilar la página.
export default function NewTransferRemissionPage() {
  return (
    <Suspense fallback={null}>
      <NewTransferRemission />
    </Suspense>
  );
}

function NewTransferRemission() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const today = todayInParaguay();

  const { data: options, isLoading, error } = useQuery({
    queryKey: ['remission-notes', 'transfer-options'],
    queryFn: () => remissionNotesApi.transferOptions(),
  });

  const [fromId, setFromId] = useState(searchParams.get('from') ?? '');
  const [toId, setToId] = useState(searchParams.get('to') ?? '');
  const [draftState, setDraft] = useState<RemissionDraft | null>(null);
  const [lines, setLines] = useState<Record<string, GoodsDraftLine>>({});
  const [chosenSeriesId, setChosenSeriesId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');

  const { data: stock = [], isLoading: stockLoading, error: stockError } = useQuery({
    queryKey: ['remission-notes', 'transfer-stock', fromId],
    queryFn: () => remissionNotesApi.transferStock(fromId),
    enabled: Boolean(fromId),
  });

  const issue = useMutation({
    mutationFn: (payload: IssueTransferPayload) => remissionNotesApi.issueTransfer(payload),
    onSuccess: async (note) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['remission-notes'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-stock'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-movements'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-product-units'] }),
      ]);
      router.push(`/dashboard/billing/remission-notes/${note.id}`);
    },
  });

  if (isLoading) {
    return <div className="py-24 text-center text-sm text-muted-foreground/60">Cargando depósitos...</div>;
  }
  if (error || !options) {
    return (
      <div className="py-24 text-center">
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(error, 'No se pudo preparar el traslado')}
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard/billing')}
          className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
        >
          Volver a Facturación
        </button>
      </div>
    );
  }

  const from = options.warehouses.find((w) => w.id === fromId);
  const to = options.warehouses.find((w) => w.id === toId);
  const draft =
    draftState ??
    emptyRemissionDraft(options.company, today, { origin: from?.place, destination: to?.place });

  const chooseFrom = (id: string) => {
    const warehouse = options.warehouses.find((w) => w.id === id);
    setFromId(id);
    setLines({});
    setChosenSeriesId('');
    if (warehouse) setDraft({ ...draft, origin: warehouse.place });
  };
  const chooseTo = (id: string) => {
    const warehouse = options.warehouses.find((w) => w.id === id);
    setToId(id);
    if (warehouse) setDraft({ ...draft, destination: warehouse.place });
  };

  const lineOf = (productId: string): GoodsDraftLine => lines[productId] ?? { quantity: 0, serialNumbers: [] };
  const setLine = (productId: string, patch: Partial<GoodsDraftLine>) =>
    setLines((current) => ({ ...current, [productId]: { ...lineOf(productId), ...patch } }));

  const branchSeries = from?.branch ? options.series.filter((s) => s.branchId === from.branch?.id) : [];
  const usable = usableOptions(branchSeries);
  const seriesId = chosenSeriesId || defaultSeriesId(branchSeries);
  const selectedSeries = usable.find((s) => s.id === seriesId);
  const numberProblem = needsDocumentNumber(selectedSeries)
    ? documentNumberError(documentNumber, selectedSeries)
    : null;
  const sameBranch = Boolean(from?.branch && to?.branch && from.branch.id === to.branch.id);

  const problem =
    (!from || !to ? 'Elegí el depósito de origen y el de destino' : null) ??
    (from && !from.branch
      ? `El depósito ${from.name} no pertenece a una sucursal: asignale una en Configuración → Depósitos`
      : null) ??
    transferLinesProblem(stock, lines) ??
    remissionDraftProblem(draft, today) ??
    (selectedSeries ? null : 'No hay una serie de notas de remisión vigente para la sucursal de origen') ??
    numberProblem;
  const onSheet = selectedSeries?.modality === 'PREPRINTED';

  function submit() {
    issue.mutate({
      ...remissionPayloadBase(draft),
      fromWarehouseId: fromId,
      toWarehouseId: toId,
      items: transferPayloadItems(stock, lines),
      ...(selectedSeries ? { seriesId: selectedSeries.id } : {}),
      ...(needsDocumentNumber(selectedSeries) ? { documentNumber: Number(documentNumber) } : {}),
    });
  }

  return (
    <div className="w-full space-y-6">
      <button
        type="button"
        onClick={() => router.push('/dashboard/billing')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} />
        Facturación
      </button>

      <div>
        <h1 className="text-2xl font-semibold text-foreground">Traslado entre sucursales</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          La mercadería sale del depósito de origen con su nota de remisión y entra al de destino al emitirla.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card className="space-y-4 p-6">
            <h2 className={SECTION_LABEL}>Depósitos</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <WarehouseSelect
                id="from-warehouse"
                label="Sale de"
                value={fromId}
                options={options.warehouses}
                exclude={toId}
                onChange={chooseFrom}
                disabled={issue.isPending}
              />
              <WarehouseSelect
                id="to-warehouse"
                label="Llega a"
                value={toId}
                options={options.warehouses}
                exclude={fromId}
                onChange={chooseTo}
                disabled={issue.isPending}
              />
            </div>
            {sameBranch && (
              <p className="text-xs text-muted-foreground">
                Los dos depósitos son de la misma sucursal: la nota no es obligatoria, pero se puede emitir igual.
              </p>
            )}
          </Card>

          {fromId && (
            <Card className="overflow-hidden p-0">
              <div className="border-b border-border px-5 py-4">
                <h2 className={SECTION_LABEL}>Mercadería</h2>
              </div>
              {stockLoading ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Cargando stock…</p>
              ) : stockError ? (
                <p role="alert" className="px-5 py-8 text-center text-sm text-destructive">
                  {apiErrorMessage(stockError, 'No se pudo cargar el stock del depósito')}
                </p>
              ) : stock.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  El depósito de origen no tiene mercadería disponible.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="whitespace-nowrap bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                      <tr>
                        <th className="px-4 py-3 text-left">Producto</th>
                        <th className="px-4 py-3 text-left">Unidad</th>
                        <th className="px-4 py-3 text-right">Disponible</th>
                        <th className="px-4 py-3 text-right">A trasladar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stock.map((row) => {
                        const line = lineOf(row.productId);
                        return (
                          <tr key={row.productId} className="align-top">
                            <td className="px-4 py-3">
                              <span className="font-medium text-foreground">{row.description}</span>
                              {row.isSerialized && (
                                <fieldset className="mt-2 space-y-1.5">
                                  <legend className="text-xs text-muted-foreground">
                                    Números de serie que se trasladan ({line.serialNumbers.length})
                                  </legend>
                                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                    {row.serialNumbers.map((serial) => (
                                      <label key={serial} className="flex items-center gap-1.5 text-xs text-foreground">
                                        <Checkbox
                                          checked={line.serialNumbers.includes(serial)}
                                          disabled={issue.isPending}
                                          onCheckedChange={(next) =>
                                            setLine(row.productId, {
                                              serialNumbers: next
                                                ? [...line.serialNumbers, serial]
                                                : line.serialNumbers.filter((s) => s !== serial),
                                            })
                                          }
                                        />
                                        <span className="font-mono">{serial}</span>
                                      </label>
                                    ))}
                                  </div>
                                </fieldset>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{row.unit}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.quantity}</td>
                            <td className="px-4 py-3 text-right">
                              {row.isSerialized ? (
                                <span className="tabular-nums text-foreground">
                                  {lineQuantity(line, true) || '—'}
                                </span>
                              ) : (
                                <Input
                                  aria-label={`Cantidad de ${row.description} a trasladar`}
                                  inputMode="numeric"
                                  className="ml-auto w-24 text-right"
                                  disabled={issue.isPending}
                                  value={line.quantity ? String(line.quantity) : ''}
                                  onChange={(e) =>
                                    setLine(row.productId, {
                                      quantity: Number(e.target.value.replace(/\D/g, '') || 0),
                                    })
                                  }
                                  placeholder="0"
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          <RemissionTransportFields
            draft={draft}
            onChange={setDraft}
            company={options.company}
            today={today}
            disabled={issue.isPending}
          />
        </div>

        <div className="space-y-6">
          <Card className="space-y-4 p-6">
            <h2 className={SECTION_LABEL}>Numeración</h2>
            {from?.branch ? (
              <SeriesNumberingFields
                options={branchSeries}
                isLoading={false}
                seriesId={seriesId}
                onSeriesChange={setChosenSeriesId}
                documentNumber={documentNumber}
                onDocumentNumberChange={setDocumentNumber}
                documentNumberError={documentNumber ? numberProblem : null}
                disabled={issue.isPending}
                documentLabel="notas de remisión"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                La nota se numera con la serie de la sucursal del depósito de origen.
              </p>
            )}
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className={SECTION_LABEL}>Emitir</h2>
            <p className="text-xs text-muted-foreground">
              {onSheet
                ? 'Llená la hoja del talonario con estos datos antes de que salga la mercadería: original para la sucursal de destino, una copia queda acá y otra viaja para el control.'
                : 'Se genera el PDF con el original y las copias. Imprimilo antes de que salga la mercadería: el original y la copia para la Administración Tributaria viajan con ella.'}
            </p>
            {issue.isError && (
              <p role="alert" className="text-xs text-destructive">
                {apiErrorMessage(issue.error, 'No se pudo emitir la nota de remisión')}
              </p>
            )}
            {problem && !issue.isError && <p className="text-xs text-muted-foreground">{problem}</p>}
            <RequirePermission permission="billing:issue">
              <Button className="w-full" disabled={Boolean(problem) || issue.isPending} onClick={submit}>
                <Send size={15} />
                {issue.isPending ? 'Emitiendo…' : 'Emitir nota y trasladar'}
              </Button>
            </RequirePermission>
          </Card>
        </div>
      </div>
    </div>
  );
}
