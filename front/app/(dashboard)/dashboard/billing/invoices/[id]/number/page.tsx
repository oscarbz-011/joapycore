'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { billingApi } from '@/lib/api/billing';
import {
  defaultSeriesId,
  documentNumberError,
  needsDocumentNumber,
  usableOptions,
} from '@/lib/billing-series';
import { formatDatePY } from '@/lib/date';
import { usePermission } from '@/lib/permissions';
import { SeriesNumberingFields } from '@/components/billing/series-numbering-fields';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const formatPrice = (n: number) =>
  new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <span>{message}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}

export default function NumberInterestInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canIssue = usePermission('billing:issue');
  const back = () => router.push('/dashboard/billing');

  const [chosenSeriesId, setChosenSeriesId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [error, setError] = useState('');

  const {
    data: invoice,
    isLoading,
    isError: invoiceFailed,
    refetch: refetchInvoice,
  } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => billingApi.getInvoice(id),
  });
  const {
    data: options = [],
    isLoading: loadingOptions,
    isError: optionsFailed,
    refetch: refetchOptions,
  } = useQuery({
    queryKey: ['invoice', id, 'series-options'],
    queryFn: () => billingApi.getSeriesOptions(id),
    enabled: Boolean(invoice && invoice.sequential == null),
  });

  const seriesId = chosenSeriesId || defaultSeriesId(options);
  const selected = usableOptions(options).find((o) => o.id === seriesId);
  const numberError = needsDocumentNumber(selected)
    ? documentNumberError(documentNumber, selected)
    : null;

  const assign = useMutation({
    mutationFn: () =>
      billingApi.assignInvoiceNumber(id, {
        seriesId: seriesId || undefined,
        ...(needsDocumentNumber(selected) ? { documentNumber: Number(documentNumber) } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      back();
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo numerar la factura')),
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={back} aria-label="Volver">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Numerar factura de intereses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            La sucursal factura con talonario: completá la hoja y cargá su número.
          </p>
        </div>
      </div>

      {isLoading && <div className="py-16 text-center text-sm text-muted-foreground">Cargando…</div>}

      {invoiceFailed && (
        <LoadError message="No se pudo cargar la factura." onRetry={() => void refetchInvoice()} />
      )}

      {invoice && invoice.sequential != null && (
        <Card className="p-6 text-sm text-muted-foreground">
          Esta factura ya tiene el número {invoice.invoicePrefix}{invoice.invoiceNumber}.
        </Card>
      )}

      {invoice && invoice.sequential == null && (
        <Card className="max-w-xl space-y-5 p-6">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Fecha</dt>
              <dd className="font-medium text-foreground">{formatDatePY(invoice.issuedAt, 'local')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-medium text-foreground">{formatPrice(Number(invoice.total))}</dd>
            </div>
          </dl>

          <SeriesNumberingFields
            options={options}
            isLoading={loadingOptions}
            seriesId={seriesId}
            onSeriesChange={setChosenSeriesId}
            documentNumber={documentNumber}
            onDocumentNumberChange={setDocumentNumber}
            documentNumberError={documentNumber ? numberError : null}
            disabled={assign.isPending}
          />

          {optionsFailed && (
            <LoadError
              message="No se pudieron cargar las series para numerar."
              onRetry={() => void refetchOptions()}
            />
          )}

          {error && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={back}>Cancelar</Button>
            {canIssue && (
              <Button
                onClick={() => {
                  setError('');
                  assign.mutate();
                }}
                disabled={!selected || Boolean(numberError) || assign.isPending}
              >
                {assign.isPending ? 'Numerando…' : 'Numerar y generar PDF'}
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
