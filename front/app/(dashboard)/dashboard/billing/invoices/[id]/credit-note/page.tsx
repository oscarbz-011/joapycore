'use client';

import { Suspense, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import {
  billingApi,
  type CreditNoteKind,
  type IssueCreditNotePayload,
} from '@/lib/api/billing';
import {
  defaultSeriesId,
  documentNumberError,
  needsDocumentNumber,
  usableOptions,
} from '@/lib/billing-series';
import {
  CREDIT_NOTE_KIND_LABELS,
  type CreditDraftLine,
  creditDraftProblem,
  creditDraftTotal,
  creditSplit,
} from '@/lib/credit-notes';
import { printPreprintedForm } from '@/lib/preprinted-form';
import { RequirePermission } from '@/components/require-permission';
import { SeriesNumberingFields } from '@/components/billing/series-numbering-fields';
import {
  EMPTY_SETTLEMENT,
  SettlementFields,
  type SettlementDraft,
  settlementProblem,
} from '@/components/billing/settlement-fields';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';
const KINDS: CreditNoteKind[] = ['TOTAL', 'ITEMS', 'AMOUNT'];
const KIND_HELP: Record<CreditNoteKind, string> = {
  TOTAL: 'Anula toda la operación.',
  ITEMS: 'El cliente devolvió ítems de la factura.',
  AMOUNT: 'Un descuento o una bonificación posterior.',
};
const IVA_RATES = [10, 5, 0] as const;

const money = (n: number) =>
  `Gs. ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n)}`;

const ivaLabel = (rate: number) => (rate === 5 || rate === 10 ? `${rate}%` : 'Exenta');

function KeyFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

// useSearchParams necesita un límite de Suspense para compilar la página.
export default function IssueCreditNotePage() {
  return (
    <Suspense fallback={null}>
      <IssueCreditNote />
    </Suspense>
  );
}

function IssueCreditNote() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data: options, isLoading, error } = useQuery({
    queryKey: ['invoice', id, 'credit-note-options'],
    queryFn: () => billingApi.getCreditNoteOptions(id),
  });

  const initialKind = searchParams.get('kind') === 'TOTAL' ? 'TOTAL' : 'ITEMS';
  const [kind, setKind] = useState<CreditNoteKind>(initialKind);
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Record<string, CreditDraftLine>>({});
  const [amount, setAmount] = useState('');
  const [ivaRate, setIvaRate] = useState<number>(10);
  const [chosenSeriesId, setChosenSeriesId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [settlement, setSettlement] = useState<SettlementDraft>(EMPTY_SETTLEMENT);
  const [printError, setPrintError] = useState('');

  const issue = useMutation({
    mutationFn: (payload: IssueCreditNotePayload) => billingApi.issueCreditNote(id, payload),
    onSuccess: async (note) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['invoice', id] }),
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['credit-notes'] }),
      ]);
      // Con talonario la nota es la hoja: se imprime apenas se emite.
      if (note.modality === 'PREPRINTED') {
        try {
          const { receipt } = await billingApi.printCreditNoteForm(note.id);
          if (receipt.formLayout) printPreprintedForm(receipt, receipt.formLayout);
        } catch (err) {
          setPrintError(apiErrorMessage(err, 'La nota se emitió, pero no se pudo imprimir'));
        }
      }
      router.push(`/dashboard/billing/credit-notes/${note.id}`);
    },
  });

  if (isLoading) {
    return <div className="py-24 text-center text-sm text-muted-foreground/60">Cargando factura...</div>;
  }
  if (error || !options) {
    return (
      <div className="py-24 text-center">
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(error, 'No se puede acreditar esta factura')}
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

  const { invoice, items, balance, customer } = options;
  const lineOf = (itemId: string): CreditDraftLine =>
    lines[itemId] ?? { quantity: 0, restockQuantity: 0, serialNumbers: [] };
  const setLine = (itemId: string, patch: Partial<CreditDraftLine>) =>
    setLines((current) => ({ ...current, [itemId]: { ...lineOf(itemId), ...patch } }));

  const amountValue = Number(amount);
  const total = creditDraftTotal(kind, items, lines, amountValue, invoice.remaining);
  const { applied, excess } = creditSplit(total, balance.outstanding);
  const draftProblem = creditDraftProblem({
    kind,
    reason,
    total,
    remaining: invoice.remaining,
    items,
    lines,
  });
  const usable = usableOptions(options.series);
  const seriesId = chosenSeriesId || defaultSeriesId(options.series);
  const selectedSeries = usable.find((s) => s.id === seriesId);
  const numberProblem = needsDocumentNumber(selectedSeries)
    ? documentNumberError(documentNumber, selectedSeries)
    : null;
  const problem =
    draftProblem ??
    (selectedSeries ? null : 'No hay una serie de notas de crédito para numerarla') ??
    numberProblem ??
    (excess > 0 ? settlementProblem(settlement) : null);
  const onSheet = selectedSeries?.modality === 'PREPRINTED';
  const totalBlocked = kind === 'TOTAL' && invoice.creditedTotal > 0;

  function submit() {
    const restock = items
      .map((item) => ({ item, line: lineOf(item.invoiceItemId) }))
      .filter(({ line }) => line.restockQuantity > 0)
      .map(({ item, line }) => ({
        invoiceItemId: item.invoiceItemId,
        quantity: line.restockQuantity,
        ...(item.isSerialized ? { serialNumbers: line.serialNumbers } : {}),
      }));
    issue.mutate({
      kind,
      reason: reason.trim(),
      ...(kind === 'ITEMS'
        ? {
            items: items
              .filter((item) => lineOf(item.invoiceItemId).quantity > 0)
              .map((item) => ({
                invoiceItemId: item.invoiceItemId,
                quantity: lineOf(item.invoiceItemId).quantity,
              })),
          }
        : {}),
      ...(kind === 'AMOUNT' ? { amount: amountValue, ivaRate } : {}),
      ...(kind !== 'AMOUNT' && restock.length > 0 ? { restock } : {}),
      ...(selectedSeries ? { seriesId: selectedSeries.id } : {}),
      ...(needsDocumentNumber(selectedSeries) ? { documentNumber: Number(documentNumber) } : {}),
      ...(excess > 0 && settlement.mode
        ? {
            excess: {
              mode: settlement.mode,
              ...(settlement.mode === 'REFUND' && settlement.method
                ? { method: settlement.method, reference: settlement.reference.trim() || undefined }
                : {}),
            },
          }
        : {}),
    });
  }

  const showItems = kind !== 'AMOUNT';

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
        <h1 className="text-2xl font-semibold text-foreground">Nota de crédito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sobre la factura <span className="font-mono">{invoice.number}</span>
          {customer && <> · {customer.name}</>}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        <KeyFact label="Total de la factura" value={money(invoice.total)} />
        <KeyFact label="Ya acreditado" value={money(invoice.creditedTotal)} />
        <KeyFact label="Queda por acreditar" value={money(invoice.remaining)} />
        <KeyFact label="El cliente todavía debe" value={money(balance.outstanding)} />
      </dl>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card className="space-y-4 p-6">
            <h2 className={SECTION_LABEL}>Qué se acredita</h2>
            <div role="group" aria-label="Tipo de nota de crédito" className="grid gap-2 sm:grid-cols-3">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    'rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
                    kind === k ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/20',
                  )}
                >
                  <span className="block text-sm font-medium text-foreground">{CREDIT_NOTE_KIND_LABELS[k]}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{KIND_HELP[k]}</span>
                </button>
              ))}
            </div>
            {totalBlocked && (
              <p role="alert" className="text-xs text-warn">
                La factura ya tiene notas de crédito: acreditá lo que queda por ítems o por importe.
              </p>
            )}
            {invoice.isCreditSale && (
              <p className="text-xs text-muted-foreground">
                Venta a crédito: cada ítem vale su parte del total financiado, y lo que se acredita achica las cuotas desde la última.
              </p>
            )}

            {kind === 'AMOUNT' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="credit-amount">
                    Importe <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="credit-amount"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">Con IVA incluido. Hasta {money(invoice.remaining)}.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="credit-iva">Tasa de IVA</Label>
                  <Select value={String(ivaRate)} onValueChange={(v) => v && setIvaRate(Number(v))}>
                    <SelectTrigger id="credit-iva" className="w-full">
                      <span className="flex-1 truncate text-left text-sm">{ivaLabel(ivaRate)}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {IVA_RATES.map((rate) => (
                        <SelectItem key={rate} value={String(rate)}>
                          {ivaLabel(rate)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </Card>

          {showItems && (
            <Card className="overflow-hidden p-0">
              <div className="border-b border-border px-5 py-4">
                <h2 className={SECTION_LABEL}>Ítems de la factura</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="whitespace-nowrap bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    <tr>
                      <th className="px-4 py-3 text-left">Descripción</th>
                      <th className="px-4 py-3 text-right">Facturado</th>
                      <th className="px-4 py-3 text-right">Por acreditar</th>
                      <th className="px-4 py-3 text-right">P. unit.</th>
                      <th className="px-4 py-3 text-right">IVA</th>
                      {kind === 'ITEMS' && <th className="px-4 py-3 text-right">A acreditar</th>}
                      <th className="px-4 py-3 text-right">Vuelve al stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((item) => {
                      const line = lineOf(item.invoiceItemId);
                      const credited = kind === 'TOTAL' ? item.quantity : line.quantity;
                      return (
                        <tr key={item.invoiceItemId} className="align-top">
                          <td className="px-4 py-3">
                            <span className="font-medium text-foreground">{item.description}</span>
                            {item.isSerialized && line.restockQuantity > 0 && (
                              <fieldset className="mt-2 space-y-1.5">
                                <legend className="text-xs text-muted-foreground">
                                  Números de serie que vuelven ({line.serialNumbers.length} de {line.restockQuantity})
                                </legend>
                                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                  {item.soldSerials.map((serial) => {
                                    const checked = line.serialNumbers.includes(serial);
                                    return (
                                      <label key={serial} className="flex items-center gap-1.5 text-xs text-foreground">
                                        <Checkbox
                                          checked={checked}
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
                                    );
                                  })}
                                </div>
                              </fieldset>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{item.quantity}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{item.creditableQuantity}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">{money(item.unitPrice)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{ivaLabel(item.ivaRate)}</td>
                          {kind === 'ITEMS' && (
                            <td className="px-4 py-3 text-right">
                              <Input
                                aria-label={`Unidades de ${item.description} a acreditar`}
                                inputMode="numeric"
                                className="ml-auto w-20 text-right"
                                disabled={item.creditableQuantity === 0}
                                value={line.quantity ? String(line.quantity) : ''}
                                onChange={(e) => {
                                  const quantity = Number(e.target.value.replace(/\D/g, '') || 0);
                                  setLine(item.invoiceItemId, {
                                    quantity,
                                    restockQuantity: Math.min(line.restockQuantity, quantity),
                                  });
                                }}
                                placeholder="0"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3 text-right">
                            {item.restockable ? (
                              <Input
                                aria-label={`Unidades de ${item.description} que vuelven al stock`}
                                inputMode="numeric"
                                className="ml-auto w-20 text-right"
                                disabled={credited === 0}
                                value={line.restockQuantity ? String(line.restockQuantity) : ''}
                                onChange={(e) => {
                                  const restockQuantity = Number(e.target.value.replace(/\D/g, '') || 0);
                                  setLine(item.invoiceItemId, {
                                    restockQuantity,
                                    serialNumbers: line.serialNumbers.slice(0, restockQuantity),
                                  });
                                }}
                                placeholder="0"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">No mueve stock</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card className="space-y-1.5 p-6">
            <Label htmlFor="credit-reason">
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="credit-reason"
              rows={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="El cliente devolvió una unidad con falla, descuento por pago anticipado…"
            />
            <p className="text-xs text-muted-foreground">Se imprime en la nota de crédito.</p>
          </Card>
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
              documentLabel="notas de crédito"
            />
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className={SECTION_LABEL}>Resumen</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Total de la nota</dt>
                <dd className="text-lg font-bold tabular-nums text-foreground">{money(total)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Descuenta de lo que debe</dt>
                <dd className="tabular-nums text-foreground">{money(applied)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Ya pagado que se acredita</dt>
                <dd className="tabular-nums text-foreground">{money(excess)}</dd>
              </div>
            </dl>

            {excess > 0 && (
              <SettlementFields
                amount={excess}
                customerName={customer?.name ?? null}
                value={settlement}
                onChange={setSettlement}
                disabled={issue.isPending}
              />
            )}

            {onSheet && (
              <p className="text-xs text-muted-foreground">
                Poné la hoja del talonario de notas de crédito en la impresora: al emitir se imprimen los datos sobre ella.
              </p>
            )}

            {(issue.isError || printError) && (
              <p role="alert" className="text-xs text-destructive">
                {printError || apiErrorMessage(issue.error, 'No se pudo emitir la nota de crédito')}
              </p>
            )}
            {problem && !issue.isError && (
              <p className="text-xs text-muted-foreground">{problem}</p>
            )}

            <RequirePermission permission="billing:cancel">
              <Button
                className="w-full"
                disabled={Boolean(problem) || totalBlocked || issue.isPending}
                onClick={submit}
              >
                <Send size={15} />
                {issue.isPending
                  ? 'Emitiendo…'
                  : onSheet
                    ? 'Emitir e imprimir sobre la hoja'
                    : 'Emitir nota de crédito'}
              </Button>
            </RequirePermission>
          </Card>
        </div>
      </div>
    </div>
  );
}
