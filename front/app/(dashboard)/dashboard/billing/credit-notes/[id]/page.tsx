'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, RotateCw } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { billingApi, type CreditNoteDetail } from '@/lib/api/billing';
import { filesApi } from '@/lib/api/files';
import { MODALITY_LABELS } from '@/lib/billing-series';
import {
  BILLING_EVENT_LABELS,
  billingEventDetail,
  CREDIT_NOTE_KIND_LABELS,
  creditNoteCustomerName,
  creditNoteInvoiceNumber,
  creditNoteNumber,
} from '@/lib/credit-notes';
import { formatDatePY } from '@/lib/date';
import { openPdf } from '@/lib/open-pdf';
import { paymentMethodLabel } from '@/lib/payment-methods';
import { usePermission } from '@/lib/permissions';
import { printPreprintedForm } from '@/lib/preprinted-form';
import { ScanPicker } from '@/components/billing/scan-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';

const money = (n: number) =>
  `Gs. ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n)}`;

const ivaLabel = (rate: number | string | null) => {
  const n = Number(rate ?? 0);
  return n === 5 || n === 10 ? `${n}%` : 'Exenta';
};

function KeyFact({ label, value, strong = false }: Readonly<{ label: string; value: string; strong?: boolean }>) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 truncate tabular-nums text-foreground ${strong ? 'text-lg font-bold' : 'text-sm font-medium'}`}>
        {value}
      </dd>
    </div>
  );
}

function InfoRow({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

/** Talonario: la nota es la hoja impresa; se imprime sobre ella y se adjunta su escaneo. */
function SheetPanel({ note }: Readonly<{ note: CreditNoteDetail }>) {
  const queryClient = useQueryClient();
  const canManage = usePermission('billing:cancel');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['credit-note', note.id] });

  const print = useMutation({
    mutationFn: () => billingApi.printCreditNoteForm(note.id),
    onSuccess: async ({ receipt }) => {
      if (receipt.formLayout) printPreprintedForm(receipt, receipt.formLayout);
      await refresh();
    },
  });
  const uploadScan = useMutation({
    mutationFn: async (file: File) => {
      const record = await filesApi.upload(file, { module: 'billing', entityType: 'CreditNote', entityId: note.id });
      return billingApi.setCreditNotePhysicalScan(note.id, record.id);
    },
    onSuccess: refresh,
  });
  const removeScan = useMutation({
    mutationFn: () => billingApi.setCreditNotePhysicalScan(note.id, null),
    onSuccess: refresh,
  });
  const error = print.error ?? uploadScan.error ?? removeScan.error;
  const printed = note.formPrintCount > 0;

  return (
    <section className="divide-y divide-border rounded-xl border border-border bg-card">
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className={SECTION_LABEL}>Hoja del talonario</h2>
          <Badge
            variant="outline"
            className={printed ? 'bg-accent-subtle text-accent-on border-accent-on/20' : 'bg-warn-subtle text-warn border-warn/30'}
          >
            {printed ? 'Impresa' : 'Sin imprimir'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {printed && note.formPrintedAt
            ? `Impresa ${note.formPrintCount === 1 ? '1 vez' : `${note.formPrintCount} veces`}, la última el ${formatDatePY(note.formPrintedAt, 'local')}`
            : 'Todavía no se imprimió sobre la hoja'}
        </p>
        {canManage && (
          <Button className="w-full" disabled={print.isPending} onClick={() => print.mutate()}>
            <Printer size={15} />
            {print.isPending ? 'Preparando…' : printed ? 'Volver a imprimir sobre la hoja' : 'Imprimir sobre la hoja'}
          </Button>
        )}
      </div>
      <div className="space-y-2 p-5">
        <h3 className="text-sm font-medium text-foreground">Nota física</h3>
        <p className="text-xs text-muted-foreground">Escaneo o foto de la hoja impresa, para el control.</p>
        <ScanPicker
          id="credit-note-scan"
          fileName={note.physicalScan?.originalName ?? null}
          uploading={uploadScan.isPending}
          disabled={removeScan.isPending}
          onOpen={note.physicalScan ? () => void openPdf(note.physicalScan!.id) : undefined}
          onPick={canManage ? (file) => uploadScan.mutate(file) : undefined}
          onRemove={canManage && note.physicalScan ? () => removeScan.mutate() : undefined}
        />
      </div>
      {error && (
        <p role="alert" className="p-5 text-xs text-destructive">
          {apiErrorMessage(error, 'No se pudo completar la acción')}
        </p>
      )}
    </section>
  );
}

export default function CreditNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: note, isLoading, error } = useQuery({
    queryKey: ['credit-note', id],
    queryFn: () => billingApi.getCreditNote(id),
  });

  const retryPdf = useMutation({
    mutationFn: () => billingApi.retryCreditNotePdf(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credit-note', id] }),
  });

  if (isLoading) {
    return <div className="py-24 text-center text-sm text-muted-foreground/60">Cargando nota de crédito...</div>;
  }
  if (error || !note) {
    return (
      <div className="py-24 text-center">
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(error, 'No se encontró la nota de crédito')}
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

  const total = Number(note.total);
  const applied = Number(note.appliedToBalance);
  const credited = note.customerCredits.reduce((sum, c) => sum + Number(c.amount), 0);
  const refunded = note.refunds.reduce((sum, r) => sum + Number(r.amount), 0);
  const onSheet = note.modality === 'PREPRINTED';

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => router.push('/dashboard/billing')}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} />
        Facturación
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              Nota de crédito <span className="font-mono">{creditNoteNumber(note)}</span>
            </h1>
            <Badge variant="outline">{CREDIT_NOTE_KIND_LABELS[note.kind]}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {creditNoteCustomerName(note)}
            {note.modality && <> · {MODALITY_LABELS[note.modality]}</>}
          </p>
        </div>
        {!onSheet && note.pdfFileId && (
          <Button variant="outline" onClick={() => void openPdf(note.pdfFileId!)}>
            <Printer size={15} />
            Imprimir / descargar PDF
          </Button>
        )}
        {!onSheet && !note.pdfFileId && (
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" disabled={retryPdf.isPending} onClick={() => retryPdf.mutate()}>
              <RotateCw size={15} className={retryPdf.isPending ? 'animate-spin' : ''} />
              {retryPdf.isPending ? 'Generando…' : 'Generar PDF'}
            </Button>
            {retryPdf.isError && (
              <p role="alert" className="text-xs text-destructive">
                {apiErrorMessage(retryPdf.error, 'No se pudo generar el PDF')}
              </p>
            )}
          </div>
        )}
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        <KeyFact label="Total" value={money(total)} strong />
        <KeyFact label="Descontó de lo que debía" value={money(applied)} />
        <KeyFact label="Saldo a favor" value={money(credited)} />
        <KeyFact label="Devuelto" value={money(refunded)} />
      </dl>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className={SECTION_LABEL}>Detalle</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <tr>
                    <th className="px-5 py-3 text-left">Descripción</th>
                    <th className="px-5 py-3 text-right">Cant.</th>
                    <th className="px-5 py-3 text-right">P. unit.</th>
                    <th className="px-5 py-3 text-right">IVA</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-right">Volvió al stock</th>
                    <th className="px-5 py-3 text-left">N° de serie</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {note.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-3 font-medium text-foreground">{item.description}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{item.quantity}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{money(Number(item.unitPrice))}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{ivaLabel(item.ivaRate)}</td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums text-foreground">{money(Number(item.total))}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                        {item.restockQuantity > 0 ? item.restockQuantity : '—'}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                        {item.serialNumbers.length > 0 ? item.serialNumbers.join(', ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {note.refunds.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className={`${SECTION_LABEL} mb-1`}>Dinero devuelto</h2>
              {note.refunds.map((refund) => (
                <InfoRow
                  key={refund.id}
                  label={`${paymentMethodLabel(refund.method)}${refund.reference ? ` · ${refund.reference}` : ''}`}
                  value={money(Number(refund.amount))}
                />
              ))}
            </section>
          )}
        </div>

        <div className="space-y-6">
          {onSheet && <SheetPanel note={note} />}

          <section className="divide-y divide-border rounded-xl border border-border bg-card">
            <div className="px-5 py-4">
              <h2 className={`${SECTION_LABEL} mb-1`}>Comprobante que modifica</h2>
              <InfoRow
                label="Factura"
                value={
                  <Link href={`/dashboard/billing/invoices/${note.invoice.id}`} className="font-mono text-primary hover:underline">
                    {creditNoteInvoiceNumber(note)}
                  </Link>
                }
              />
              <InfoRow label="Motivo" value={note.reason} />
            </div>
            <div className="px-5 py-4">
              <h2 className={`${SECTION_LABEL} mb-1`}>Timbrado</h2>
              <InfoRow label="N° de timbrado" value={note.timbrado ?? '—'} />
              {note.timbradoValidUntil && (
                <InfoRow
                  label="Vigencia"
                  value={`${formatDatePY(note.timbradoValidFrom, 'utc')} al ${formatDatePY(note.timbradoValidUntil, 'utc')}`}
                />
              )}
              <InfoRow label="Emitida" value={formatDatePY(note.issuedAt, 'local')} />
            </div>
            <div className="px-5 py-4">
              <h2 className={`${SECTION_LABEL} mb-2`}>Historial</h2>
              {note.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin movimientos.</p>
              ) : (
                <ol className="space-y-2">
                  {note.events.map((event) => (
                    <li key={event.id} className="text-sm">
                      <span className="font-medium text-foreground">{BILLING_EVENT_LABELS[event.type]}</span>
                      <span className="text-muted-foreground"> · {formatDatePY(event.createdAt, 'local')}</span>
                      {billingEventDetail(event) && (
                        <p className="text-xs text-muted-foreground">{billingEventDetail(event)}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
