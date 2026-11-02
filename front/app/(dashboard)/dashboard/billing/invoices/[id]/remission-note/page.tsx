'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { type IssueSaleRemissionPayload, remissionNotesApi } from '@/lib/api/remission-notes';
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
  saleLinesProblem,
  salePayloadItems,
  todayInParaguay,
} from '@/lib/remission-notes';
import { RequirePermission } from '@/components/require-permission';
import { RemissionTransportFields } from '@/components/billing/remission-transport-fields';
import { SeriesNumberingFields } from '@/components/billing/series-numbering-fields';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';

export default function SaleRemissionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const today = todayInParaguay();

  const { data: options, isLoading, error } = useQuery({
    queryKey: ['invoice', id, 'remission-options'],
    queryFn: () => remissionNotesApi.saleOptions(id),
  });

  const [draftState, setDraft] = useState<RemissionDraft | null>(null);
  const [recipientName, setRecipientName] = useState<string | null>(null);
  const [recipientDocument, setRecipientDocument] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, GoodsDraftLine>>({});
  const [chosenSeriesId, setChosenSeriesId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');

  const issue = useMutation({
    mutationFn: (payload: IssueSaleRemissionPayload) => remissionNotesApi.issueForSale(id, payload),
    onSuccess: async (note) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
        queryClient.invalidateQueries({ queryKey: ['remission-notes'] }),
      ]);
      router.push(`/dashboard/billing/remission-notes/${note.id}`);
    },
  });

  if (isLoading) {
    return <div className="py-24 text-center text-sm text-muted-foreground/60">Cargando factura...</div>;
  }
  if (error || !options) {
    return (
      <div className="py-24 text-center">
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(error, 'No se puede emitir una nota de remisión para esta factura')}
        </p>
        <button
          type="button"
          onClick={() => router.push(`/dashboard/billing/invoices/${id}`)}
          className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
        >
          Volver a la factura
        </button>
      </div>
    );
  }

  const { invoice, items } = options;
  const draft =
    draftState ??
    emptyRemissionDraft(options.company, today, {
      origin: options.origin,
      destination: options.destination,
    });
  const name = recipientName ?? options.recipient.name;
  const document = recipientDocument ?? options.recipient.document;

  const lineOf = (itemId: string): GoodsDraftLine => lines[itemId] ?? { quantity: 0, serialNumbers: [] };
  const setLine = (itemId: string, patch: Partial<GoodsDraftLine>) =>
    setLines((current) => ({ ...current, [itemId]: { ...lineOf(itemId), ...patch } }));

  const usable = usableOptions(options.series);
  const seriesId = chosenSeriesId || defaultSeriesId(options.series);
  const selectedSeries = usable.find((s) => s.id === seriesId);
  const numberProblem = needsDocumentNumber(selectedSeries)
    ? documentNumberError(documentNumber, selectedSeries)
    : null;
  const nothingLeft = items.length > 0 && items.every((item) => item.remitable === 0);

  const problem =
    (items.length === 0 ? 'La factura no tiene mercadería para enviar' : null) ??
    (nothingLeft ? 'Toda la mercadería de la factura ya salió con otras notas de remisión' : null) ??
    (name.trim().length < 3 ? 'Cargá el nombre del destinatario' : null) ??
    (document.trim().length < 3 ? 'Cargá el RUC o la cédula del destinatario' : null) ??
    saleLinesProblem(items, lines) ??
    remissionDraftProblem(draft, today) ??
    (selectedSeries ? null : 'No hay una serie de notas de remisión vigente para la sucursal') ??
    numberProblem;
  const onSheet = selectedSeries?.modality === 'PREPRINTED';

  function submit() {
    issue.mutate({
      ...remissionPayloadBase(draft),
      recipientName: name.trim(),
      recipientDocument: document.trim(),
      items: salePayloadItems(items, lines),
      ...(selectedSeries ? { seriesId: selectedSeries.id } : {}),
      ...(needsDocumentNumber(selectedSeries) ? { documentNumber: Number(documentNumber) } : {}),
    });
  }

  return (
    <div className="w-full space-y-6">
      <button
        type="button"
        onClick={() => router.push(`/dashboard/billing/invoices/${id}`)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} />
        Factura <span className="font-mono">{invoice.number}</span>
      </button>

      <div>
        <h1 className="text-2xl font-semibold text-foreground">Nota de remisión</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Envío de la factura <span className="font-mono">{invoice.number}</span>. Es opcional: si la factura acompaña a la
          mercadería con los datos del traslado, no hace falta.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card className="space-y-4 p-6">
            <h2 className={SECTION_LABEL}>Destinatario</h2>
            {invoice.anonymousBuyer && (
              <p className="text-xs text-muted-foreground">
                La factura es a &quot;Sin Nombre&quot;, pero la nota de remisión identifica a quien recibe la mercadería.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="recipient-name">
                  Nombre o razón social <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="recipient-name"
                  value={name}
                  disabled={issue.isPending}
                  onChange={(e) => setRecipientName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recipient-document">
                  RUC o cédula <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="recipient-document"
                  value={document}
                  disabled={issue.isPending}
                  onChange={(e) => setRecipientDocument(e.target.value)}
                />
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-5 py-4">
              <h2 className={SECTION_LABEL}>Mercadería que se envía</h2>
            </div>
            {items.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                La factura solo tiene servicios: no hay mercadería que trasladar.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="whitespace-nowrap bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    <tr>
                      <th className="px-4 py-3 text-left">Descripción</th>
                      <th className="px-4 py-3 text-left">Unidad</th>
                      <th className="px-4 py-3 text-right">Facturado</th>
                      <th className="px-4 py-3 text-right">Ya enviado</th>
                      <th className="px-4 py-3 text-right">Por enviar</th>
                      <th className="px-4 py-3 text-right">A enviar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((item) => {
                      const line = lineOf(item.invoiceItemId);
                      return (
                        <tr key={item.invoiceItemId} className="align-top">
                          <td className="px-4 py-3">
                            <span className="font-medium text-foreground">{item.description}</span>
                            {item.isSerialized && item.remitable > 0 && (
                              <fieldset className="mt-2 space-y-1.5">
                                <legend className="text-xs text-muted-foreground">
                                  Números de serie que se envían ({line.serialNumbers.length})
                                </legend>
                                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                  {item.soldSerials.map((serial) => (
                                    <label key={serial} className="flex items-center gap-1.5 text-xs text-foreground">
                                      <Checkbox
                                        checked={line.serialNumbers.includes(serial)}
                                        disabled={issue.isPending}
                                        onCheckedChange={(next) =>
                                          setLine(item.invoiceItemId, {
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
                          <td className="px-4 py-3 text-muted-foreground">{item.unit}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{item.quantity}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{item.remitted}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{item.remitable}</td>
                          <td className="px-4 py-3 text-right">
                            {item.isSerialized ? (
                              <span className="tabular-nums text-foreground">{lineQuantity(line, true) || '—'}</span>
                            ) : (
                              <Input
                                aria-label={`Cantidad de ${item.description} a enviar`}
                                inputMode="numeric"
                                className="ml-auto w-24 text-right"
                                disabled={issue.isPending || item.remitable === 0}
                                value={line.quantity ? String(line.quantity) : ''}
                                onChange={(e) =>
                                  setLine(item.invoiceItemId, {
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
            <SeriesNumberingFields
              options={options.series}
              isLoading={false}
              seriesId={seriesId}
              onSeriesChange={setChosenSeriesId}
              documentNumber={documentNumber}
              onDocumentNumberChange={setDocumentNumber}
              documentNumberError={documentNumber ? numberProblem : null}
              disabled={issue.isPending}
              documentLabel="notas de remisión"
            />
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className={SECTION_LABEL}>Emitir</h2>
            <p className="text-xs text-muted-foreground">
              {onSheet
                ? 'Llená la hoja del talonario con estos datos antes de que salga la mercadería.'
                : 'Se genera el PDF con el original y las copias. El original y la copia para la Administración Tributaria viajan con la mercadería.'}
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
                {issue.isPending ? 'Emitiendo…' : 'Emitir nota de remisión'}
              </Button>
            </RequirePermission>
          </Card>
        </div>
      </div>
    </div>
  );
}
