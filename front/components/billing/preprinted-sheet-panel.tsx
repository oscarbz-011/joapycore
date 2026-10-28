'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileImage, Printer, TriangleAlert, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { billingApi, type Invoice } from '@/lib/api/billing';
import { filesApi } from '@/lib/api/files';
import { openPdf } from '@/lib/open-pdf';
import { usePermission } from '@/lib/permissions';
import { printPreprintedForm } from '@/lib/preprinted-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type SheetInvoice = Pick<
  Invoice,
  'id' | 'invoicePrefix' | 'invoiceNumber' | 'formPrintCount' | 'formPrintedAt' | 'physicalScan'
>;

const SCAN_TYPES = 'image/*,application/pdf';

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
      setVoiding(false);
      setReason('');
      setNextSheet('');
      setVoidScanId(null);
      setVoidScanName('');
      refresh();
    },
    onError: fail('No se pudo inutilizar la hoja'),
  });

  const busy = print.isPending || voidSheet.isPending || uploadScan.isPending || removeScan.isPending;
  const sheet = `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber ?? ''}`;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Talonario</h2>
        <p className="mt-2 text-sm text-foreground">
          Hoja N° <span className="font-mono">{sheet}</span>
        </p>
        <p className="text-xs text-muted-foreground">{printedLabel(invoice)}</p>
      </div>

      {moved && (
        <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
          La factura pasó a la hoja N° <span className="font-mono">{moved}</span>. Poné esa hoja en la impresora y
          tocá Imprimir sobre la hoja.
        </p>
      )}

      {canIssue && (
        <Button className="w-full" disabled={busy} onClick={() => { setError(''); print.mutate(); }}>
          <Printer size={15} />
          {print.isPending ? 'Preparando…' : 'Imprimir sobre la hoja'}
        </Button>
      )}

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">Factura física escaneada</p>
        {invoice.physicalScan ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <button
              type="button"
              onClick={() => void openPdf(invoice.physicalScan!.id)}
              className="flex min-w-0 items-center gap-1.5 text-primary hover:underline"
            >
              <FileImage size={14} className="shrink-0" />
              <span className="truncate">{invoice.physicalScan.originalName}</span>
            </button>
            {canIssue && (
              <button
                type="button"
                disabled={busy}
                onClick={() => removeScan.mutate()}
                className="rounded p-1 text-muted-foreground hover:bg-muted/20 hover:text-destructive"
                aria-label="Quitar el escaneo"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sin escaneo adjunto.</p>
        )}
        {canIssue && (
          <div className="space-y-1">
            <Label htmlFor="physical-scan" className="text-xs text-muted-foreground">
              {invoice.physicalScan ? 'Reemplazar por otro escaneo o foto' : 'Adjuntar escaneo o foto'}
            </Label>
            <Input
              id="physical-scan"
              type="file"
              accept={SCAN_TYPES}
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadScan.mutate(file);
                e.target.value = '';
              }}
            />
            {uploadScan.isPending && <p className="text-xs text-muted-foreground">Subiendo…</p>}
          </div>
        )}
      </div>

      {canIssue && (
        <div className="space-y-3 border-t border-border pt-4">
          {voiding ? (
            <>
              <div className="flex items-start gap-2 text-xs text-warn">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span>
                  La hoja N° {sheet} queda inutilizada y no se vuelve a usar. Guardá la hoja física (original y
                  copias) para el control.
                </span>
              </div>
              <div className="space-y-1">
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
              <div className="space-y-1">
                <Label htmlFor="void-next">Imprimir en la hoja N°</Label>
                <Input
                  id="void-next"
                  inputMode="numeric"
                  value={nextSheet}
                  onChange={(e) => setNextSheet(e.target.value.replace(/\D/g, ''))}
                  placeholder="La siguiente del talonario"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="void-scan">Escaneo o foto de la hoja inutilizada</Label>
                {voidScanName && <p className="text-xs text-foreground">{voidScanName}</p>}
                <Input
                  id="void-scan"
                  type="file"
                  accept={SCAN_TYPES}
                  disabled={uploadVoidScan.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadVoidScan.mutate(file);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={reason.trim().length < 3 || busy || uploadVoidScan.isPending}
                  onClick={() => { setError(''); voidSheet.mutate(); }}
                >
                  {voidSheet.isPending ? 'Inutilizando…' : 'Inutilizar y pasar a otra hoja'}
                </Button>
                <Button variant="outline" onClick={() => setVoiding(false)}>
                  Volver
                </Button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => { setMoved(''); setVoiding(true); }}
              className="text-sm font-medium text-destructive underline underline-offset-2 hover:opacity-80"
            >
              La hoja salió mal
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
