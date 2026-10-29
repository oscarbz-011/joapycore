'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer, TriangleAlert } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { billingApi, type Invoice } from '@/lib/api/billing';
import { filesApi } from '@/lib/api/files';
import { openPdf } from '@/lib/open-pdf';
import { usePermission } from '@/lib/permissions';
import { printPreprintedForm } from '@/lib/preprinted-form';
import { ScanPicker } from '@/components/billing/scan-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type SheetInvoice = Pick<
  Invoice,
  'id' | 'invoicePrefix' | 'invoiceNumber' | 'formPrintCount' | 'formPrintedAt' | 'physicalScan'
>;

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';

function printedLabel(invoice: SheetInvoice): string {
  if (invoice.formPrintCount === 0 || !invoice.formPrintedAt) return 'Todavía no se imprimió sobre la hoja';
  const when = new Date(invoice.formPrintedAt).toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Asuncion',
  });
  const times = invoice.formPrintCount === 1 ? '1 vez' : `${invoice.formPrintCount} veces`;
  return `Impresa ${times}, la última el ${when}`;
}

/** Imprimir sobre la hoja del talonario, inutilizarla si salió mal y adjuntar su escaneo. */
export function PreprintedSheetPanel({ invoice }: Readonly<{ invoice: SheetInvoice }>) {
  const queryClient = useQueryClient();
  const canIssue = usePermission('billing:issue');
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [nextSheet, setNextSheet] = useState('');
  const [voidScanId, setVoidScanId] = useState<string | null>(null);
  const [voidScanName, setVoidScanName] = useState('');
  const [moved, setMoved] = useState('');
  const [error, setError] = useState('');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };
  const fail = (fallback: string) => (err: unknown) => setError(apiErrorMessage(err, fallback));

  function closeVoiding() {
    setVoiding(false);
    setReason('');
    setNextSheet('');
    setVoidScanId(null);
    setVoidScanName('');
  }

  const print = useMutation({
    mutationFn: () => billingApi.printInvoiceForm(invoice.id),
    onSuccess: ({ receipt }) => {
      if (receipt.formLayout) printPreprintedForm(receipt, receipt.formLayout);
      refresh();
    },
    onError: fail('No se pudo imprimir la factura'),
  });

  const uploadScan = useMutation({
    mutationFn: async (file: File) => {
      const record = await filesApi.upload(file, { module: 'billing', entityType: 'Invoice', entityId: invoice.id });
      return billingApi.setInvoicePhysicalScan(invoice.id, record.id);
    },
    onSuccess: refresh,
    onError: fail('No se pudo adjuntar el escaneo'),
  });

  const removeScan = useMutation({
    mutationFn: () => billingApi.setInvoicePhysicalScan(invoice.id, null),
    onSuccess: refresh,
    onError: fail('No se pudo quitar el escaneo'),
  });

  const uploadVoidScan = useMutation({
    mutationFn: (file: File) =>
      filesApi.upload(file, { module: 'billing', entityType: 'BillingVoidedNumber', entityId: invoice.id }),
    onSuccess: (record) => {
      setVoidScanId(record.id);
      setVoidScanName(record.originalName);
    },
    onError: fail('No se pudo subir el escaneo de la hoja'),
  });

  const voidSheet = useMutation({
    mutationFn: () =>
      billingApi.voidInvoiceSheet(invoice.id, {
        reason: reason.trim(),
        ...(nextSheet ? { documentNumber: Number(nextSheet) } : {}),
        ...(voidScanId ? { scanFileId: voidScanId } : {}),
      }),
    onSuccess: (updated) => {
      setMoved(`${updated.invoicePrefix ?? ''}${updated.invoiceNumber ?? ''}`);
      closeVoiding();
      refresh();
    },
    onError: fail('No se pudo inutilizar la hoja'),
  });

  const busy = print.isPending || voidSheet.isPending || uploadScan.isPending || removeScan.isPending;
  const sheet = `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber ?? ''}`;
  const printed = invoice.formPrintCount > 0;
  const scan = invoice.physicalScan;
  let printLabel = 'Imprimir sobre la hoja';
  if (print.isPending) printLabel = 'Preparando…';
  else if (printed) printLabel = 'Volver a imprimir sobre la hoja';

  return (
    <section className="divide-y divide-border rounded-xl border border-border bg-card">
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={SECTION_LABEL}>Hoja del talonario</h2>
            <p className="mt-1.5 text-base font-medium text-foreground">
              Hoja N° <span className="font-mono">{sheet}</span>
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              printed
                ? 'shrink-0 bg-accent-subtle text-accent-on border-accent-on/20'
                : 'shrink-0 bg-warn-subtle text-warn border-warn/30'
            }
          >
            {printed ? 'Impresa' : 'Sin imprimir'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{printedLabel(invoice)}</p>

        {moved && (
          <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
            La factura pasó a la hoja N° <span className="font-mono">{moved}</span>. Poné esa hoja en la impresora y
            tocá Imprimir sobre la hoja.
          </p>
        )}

        {canIssue && (
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => {
              setError('');
              print.mutate();
            }}
          >
            <Printer size={15} />
            {printLabel}
          </Button>
        )}
      </div>

      <div className="space-y-2 p-5">
        <h3 className="text-sm font-medium text-foreground">Factura física</h3>
        <p className="text-xs text-muted-foreground">Escaneo o foto de la hoja impresa, para el control.</p>
        <ScanPicker
          id="physical-scan"
          fileName={scan?.originalName ?? null}
          uploading={uploadScan.isPending}
          disabled={busy}
          onOpen={scan ? () => void openPdf(scan.id) : undefined}
          onPick={canIssue ? (file) => uploadScan.mutate(file) : undefined}
          onRemove={canIssue && scan ? () => removeScan.mutate() : undefined}
        />
      </div>

      {canIssue && (
        <div className="space-y-3 p-5">
          {voiding ? (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-subtle px-3 py-2 text-xs text-warn">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span>
                  La hoja N° {sheet} queda inutilizada y no se vuelve a usar. Guardá la hoja física (original y
                  copias) para el control.
                </span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="void-reason">Motivo *</Label>
                <Textarea
                  id="void-reason"
                  rows={2}
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Se trabó el papel, salió corrida…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="void-next">Imprimir en la hoja N°</Label>
                <Input
                  id="void-next"
                  inputMode="numeric"
                  value={nextSheet}
                  onChange={(e) => setNextSheet(e.target.value.replace(/\D/g, ''))}
                  placeholder="La siguiente del talonario"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">Escaneo o foto de la hoja inutilizada</p>
                <ScanPicker
                  id="void-scan"
                  fileName={voidScanName || null}
                  uploading={uploadVoidScan.isPending}
                  onPick={(file) => uploadVoidScan.mutate(file)}
                  onRemove={() => {
                    setVoidScanId(null);
                    setVoidScanName('');
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={reason.trim().length < 3 || busy || uploadVoidScan.isPending}
                  onClick={() => {
                    setError('');
                    voidSheet.mutate();
                  }}
                >
                  {voidSheet.isPending ? 'Inutilizando…' : 'Inutilizar y pasar a otra hoja'}
                </Button>
                <Button variant="outline" onClick={closeVoiding}>
                  Volver
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                ¿Se trabó el papel o salió corrida? Inutilizá la hoja y la factura pasa a la siguiente.
              </p>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  setMoved('');
                  setVoiding(true);
                }}
              >
                <TriangleAlert size={14} />
                La hoja salió mal
              </Button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="p-5 text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
