'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileImage } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { billingApi, type BillingSeries, type VoidedSheet } from '@/lib/api/billing';
import { filesApi } from '@/lib/api/files';
import { formatDatePY } from '@/lib/date';
import { openPdf } from '@/lib/open-pdf';
import { usePagination } from '@/lib/use-pagination';
import { useTableSort } from '@/lib/use-table-sort';
import { SortableHeader } from '@/components/sortable-header';
import { TablePagination } from '@/components/table-pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const invoiceRef = (sheet: VoidedSheet) =>
  sheet.invoice ? `${sheet.invoice.invoicePrefix ?? ''}${sheet.invoice.invoiceNumber ?? ''}` : '';

const VOIDED_SORT = {
  sheet: (s: VoidedSheet) => s.sequential,
  reason: (s: VoidedSheet) => s.reason,
  invoice: invoiceRef,
  date: (s: VoidedSheet) => new Date(s.createdAt),
  scan: (s: VoidedSheet) => (s.scanFile ? 1 : 0),
};

/** Hojas del talonario que no se usaron como factura, y el alta de una hoja suelta. */
export function VoidedSheets({ series, canManage }: Readonly<{ series: BillingSeries; canManage: boolean }>) {
  const queryClient = useQueryClient();
  const [number, setNumber] = useState('');
  const [reason, setReason] = useState('');
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanName, setScanName] = useState('');
  const [error, setError] = useState('');

  const { data: sheets = [], isLoading, error: loadError } = useQuery({
    queryKey: ['billing-series', series.id, 'voided'],
    queryFn: () => billingApi.listVoidedSheets(series.id),
  });
  const { sorted, sort, toggle } = useTableSort(sheets, VOIDED_SORT);
  const pagination = usePagination(sorted);

  const upload = useMutation({
    mutationFn: (file: File) =>
      filesApi.upload(file, { module: 'billing', entityType: 'BillingVoidedNumber', entityId: series.id }),
    onSuccess: (record) => {
      setScanId(record.id);
      setScanName(record.originalName);
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo subir el escaneo')),
  });

  const voidSheet = useMutation({
    mutationFn: () =>
      billingApi.voidLooseSheet(series.id, {
        documentNumber: Number(number),
        reason: reason.trim(),
        ...(scanId ? { scanFileId: scanId } : {}),
      }),
    onSuccess: async () => {
      setNumber('');
      setReason('');
      setScanId(null);
      setScanName('');
      await queryClient.invalidateQueries({ queryKey: ['billing-series'] });
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo inutilizar la hoja')),
  });

  const numberValue = Number(number);
  const numberProblem =
    number && (numberValue < series.rangeFrom || numberValue > series.rangeTo)
      ? `El talonario va del ${series.rangeFrom} al ${series.rangeTo}`
      : null;

  return (
    <Card className="mt-6 divide-y divide-border p-0">
      <section className="space-y-1 p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Hojas inutilizadas</p>
        <p className="text-sm text-muted-foreground">
          Hojas que no se usaron como factura. Su número no se vuelve a usar; guardá las hojas físicas para el control.
        </p>
      </section>

      {isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Cargando…</p>
      ) : loadError ? (
        <p role="alert" className="p-6 text-sm text-destructive">
          {apiErrorMessage(loadError, 'No se pudieron cargar las hojas inutilizadas')}
        </p>
      ) : sheets.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No hay hojas inutilizadas en esta serie.</p>
      ) : (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <SortableHeader label="Hoja N°" sortKey="sheet" sort={sort} onSort={toggle} />
                  <SortableHeader label="Motivo" sortKey="reason" sort={sort} onSort={toggle} />
                  <SortableHeader label="Factura que tenía" sortKey="invoice" sort={sort} onSort={toggle} />
                  <SortableHeader label="Fecha" sortKey="date" sort={sort} onSort={toggle} />
                  <SortableHeader label="Escaneo" sortKey="scan" sort={sort} onSort={toggle} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagination.items.map((sheet) => (
                  <tr key={sheet.id}>
                    <td className="px-4 py-3 font-mono text-foreground">{sheet.sequential}</td>
                    <td className="px-4 py-3 text-muted-foreground">{sheet.reason}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{invoiceRef(sheet) || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDatePY(sheet.createdAt, 'local')}</td>
                    <td className="px-4 py-3">
                      {sheet.scanFile ? (
                        <button
                          type="button"
                          onClick={() => void openPdf(sheet.scanFile!.id)}
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <FileImage size={13} /> Ver
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination {...pagination.controls} label="hojas" className="border-t border-border px-4 py-3" />
        </div>
      )}

      {canManage && (
        <section className="space-y-3 p-6">
          <p className="text-sm font-medium text-foreground">Inutilizar una hoja sin factura (extraviada, dañada…)</p>
          <div className="grid gap-3 md:grid-cols-[8rem_1fr]">
            <div className="space-y-1">
              <Label htmlFor="loose-number">Hoja N°</Label>
              <Input
                id="loose-number"
                inputMode="numeric"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="loose-reason">Motivo</Label>
              <Input id="loose-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="loose-scan">Escaneo o foto de la hoja (opcional)</Label>
            {scanName && <p className="text-xs text-foreground">{scanName}</p>}
            <Input
              id="loose-scan"
              type="file"
              accept="image/*,application/pdf"
              disabled={upload.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.target.value = '';
              }}
            />
          </div>
          {(numberProblem || error) && (
            <p role="alert" className="text-xs text-destructive">
              {numberProblem || error}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              variant="destructive"
              disabled={!number || reason.trim().length < 3 || Boolean(numberProblem) || voidSheet.isPending || upload.isPending}
              onClick={() => {
                setError('');
                voidSheet.mutate();
              }}
            >
              {voidSheet.isPending ? 'Inutilizando…' : 'Inutilizar hoja'}
            </Button>
          </div>
        </section>
      )}
    </Card>
  );
}
