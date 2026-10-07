'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText } from 'lucide-react';
import { RequirePermission } from '@/components/require-permission';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api/api-error';
import { filesApi } from '@/lib/api/files';
import { supplierInvoicesApi } from '@/lib/api/supplier-invoices';
import { formatDatePY } from '@/lib/date';
import { openPdf } from '@/lib/open-pdf';
import {
  INVOICE_STATUS_LABEL,
  differenceLabel,
  invoiceFileError,
  type SupplierInvoiceStatus,
} from '@/lib/supplier-invoice';
import { cn } from '@/lib/utils';

const PAYABLES_PATH = '/dashboard/procurement/payables';
const gs = (n: number) => 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));

const STATUS_CLASS: Record<SupplierInvoiceStatus, string> = {
  MATCHED: 'bg-accent-subtle text-accent-on border-accent-on/20',
  APPROVED: 'bg-accent-subtle text-accent-on border-accent-on/20',
  PENDING_APPROVAL: 'bg-warn-subtle text-warn border-warn/30',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/30',
};

const TH = 'px-4 py-3 text-left whitespace-nowrap';
const TH_R = 'px-4 py-3 text-right whitespace-nowrap';
const NUM = 'px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap';

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

const person = (p: { firstName: string; lastName: string } | null) =>
  p ? `${p.firstName} ${p.lastName}` : '—';

export default function SupplierInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [fileNote, setFileNote] = useState('');

  const { data: invoice, isLoading, isError, refetch } = useQuery({
    queryKey: ['supplier-invoice', id],
    queryFn: () => supplierInvoicesApi.get(id),
  });

  const mutation = useMutation({
    mutationFn: () =>
      deciding === 'approve'
        ? supplierInvoicesApi.approve(id, note.trim() || undefined)
        : supplierInvoicesApi.reject(id, note.trim()),
    onSuccess: (updated) => {
      queryClient.setQueryData(['supplier-invoice', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['accounts-payable'] });
      void queryClient.invalidateQueries({ queryKey: ['invoiceable-payables'] });
      // El anticipo que la factura no usó vuelve a la orden.
      void queryClient.invalidateQueries({ queryKey: ['purchase-order'] });
      setDeciding(null);
      setNote('');
    },
    onError: (err) => {
      setError(apiErrorMessage(err, 'No se pudo guardar la decisión'));
      void refetch();
    },
  });

  const fileMutation = useMutation({
    mutationFn: async (picked: File) => {
      const uploaded = await filesApi.upload(picked, {
        module: 'procurement',
        entityType: 'supplier-invoice',
        entityId: id,
      });
      return supplierInvoicesApi.attachFile(id, uploaded.id);
    },
    onSuccess: (updated) => queryClient.setQueryData(['supplier-invoice', id], updated),
    onError: (err) => setFileNote(apiErrorMessage(err, 'No se pudo adjuntar el archivo')),
  });

  function decide() {
    if (deciding === 'reject' && !note.trim()) {
      setError('Indicá qué se le reclama al proveedor');
      return;
    }
    setError('');
    mutation.mutate();
  }

  const back = (
    <Link
      href={PAYABLES_PATH}
      className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft size={14} aria-hidden />
      Volver a cuentas por pagar
    </Link>
  );

  if (isLoading) {
    return (
      <div>
        {back}
        <p className="py-16 text-center text-sm text-muted-foreground">Cargando factura...</p>
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div>
        {back}
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {isError ? 'No se pudo cargar la factura.' : 'No se encontró la factura.'}
          </p>
          {isError && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              Reintentar
            </Button>
          )}
        </div>
      </div>
    );
  }

  const difference = invoice.total - invoice.estimatedTotal;
  const pending = invoice.status === 'PENDING_APPROVAL';

  return (
    <div>
      {back}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-sm text-muted-foreground">Factura {invoice.invoiceNumber}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
            {invoice.supplier.name}
          </h1>
          <Badge variant="outline" className={cn('mt-2', STATUS_CLASS[invoice.status])}>
            {INVOICE_STATUS_LABEL[invoice.status]}
          </Badge>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total de la factura
          </p>
          <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
            {gs(invoice.total)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card className="gap-4 p-5">
            <SectionTitle>Datos de la factura</SectionTitle>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
              <Fact label="Número">{invoice.invoiceNumber}</Fact>
              <Fact label="Timbrado">{invoice.timbrado ?? '—'}</Fact>
              <Fact label="Fecha">{formatDatePY(invoice.invoiceDate, 'utc')}</Fact>
              <Fact label="Cargada por">{person(invoice.createdBy)}</Fact>
            </dl>
            {invoice.notes && (
              <p className="border-t border-border pt-3 text-sm whitespace-pre-line text-foreground">
                {invoice.notes}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
              {invoice.fileId ? (
                <Button variant="outline" size="sm" onClick={() => void openPdf(invoice.fileId!)}>
                  <FileText size={15} />
                  Ver la factura adjunta
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Sin archivo adjunto.</p>
              )}
              <RequirePermission permission="procurement:payables:register">
                <label
                  className={cn(
                    'cursor-pointer text-sm font-medium text-foreground underline underline-offset-2',
                    fileMutation.isPending && 'pointer-events-none opacity-60',
                  )}
                >
                  {fileMutation.isPending
                    ? 'Subiendo...'
                    : invoice.fileId
                      ? 'Reemplazar el archivo'
                      : 'Adjuntar PDF o imagen'}
                  <input
                    type="file"
                    className="sr-only"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={fileMutation.isPending}
                    onChange={(e) => {
                      const picked = e.target.files?.[0];
                      e.target.value = '';
                      if (!picked) return;
                      const problem = invoiceFileError(picked);
                      setFileNote(problem ?? '');
                      if (!problem) fileMutation.mutate(picked);
                    }}
                  />
                </label>
              </RequirePermission>
              {fileNote && (
                <p role="alert" className="basis-full text-xs text-destructive">
                  {fileNote}
                </p>
              )}
            </div>
          </Card>

          <Card className="gap-0 overflow-hidden p-0">
            <div className="px-5 py-4">
              <SectionTitle>Factura contra lo recibido</SectionTitle>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-y border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className={TH}>Recepción</th>
                    <th className={TH}>Producto</th>
                    <th className={TH_R}>Recibido</th>
                    <th className={TH_R}>Facturado</th>
                    <th className={TH_R}>Costo de la orden</th>
                    <th className={TH_R}>Precio facturado</th>
                    <th className={TH_R}>Subtotal</th>
                    <th className={TH_R}>Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoice.items.map((item) => {
                    const lineDifference =
                      item.quantity * item.unitCost -
                      item.receivedQuantity * item.receivedUnitCost;
                    const quantityDiffers = item.quantity !== item.receivedQuantity;
                    const priceDiffers = Math.abs(item.unitCost - item.receivedUnitCost) > 0.005;
                    return (
                      <tr
                        key={item.id}
                        className={cn((quantityDiffers || priceDiffers) && 'bg-warn-subtle/40')}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          #{item.purchaseReceiptItem.purchaseReceipt.receiptNumber}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {item.purchaseReceiptItem.product.name}
                        </td>
                        <td className={cn(NUM, 'text-muted-foreground')}>{item.receivedQuantity}</td>
                        <td className={cn(NUM, quantityDiffers && 'font-bold text-warn')}>
                          {item.quantity}
                        </td>
                        <td className={cn(NUM, 'text-muted-foreground')}>
                          {gs(item.receivedUnitCost)}
                        </td>
                        <td className={cn(NUM, priceDiffers && 'font-bold text-warn')}>
                          {gs(item.unitCost)}
                        </td>
                        <td className={cn(NUM, 'font-medium text-foreground')}>
                          {gs(item.quantity * item.unitCost)}
                        </td>
                        <td className={cn(NUM, lineDifference !== 0 && 'text-warn')}>
                          {Math.abs(lineDifference) < 0.01
                            ? '—'
                            : `${lineDifference > 0 ? '+' : '−'} ${gs(Math.abs(lineDifference))}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card className="gap-3 p-5">
            <SectionTitle>Resultado</SectionTitle>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Productos</dt>
                <dd className="font-mono tabular-nums">{gs(invoice.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Flete aparte</dt>
                <dd className="font-mono tabular-nums">{gs(invoice.shippingAmount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Descuento global</dt>
                <dd className="font-mono tabular-nums">− {gs(invoice.discountAmount)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-border pt-1.5">
                <dt className="font-semibold text-foreground">Total de la factura</dt>
                <dd className="font-mono font-bold tabular-nums">{gs(invoice.total)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Estimado al recibir</dt>
                <dd className="font-mono tabular-nums text-muted-foreground">
                  {gs(invoice.estimatedTotal)}
                </dd>
              </div>
            </dl>
            <p className="text-sm font-medium text-foreground">{differenceLabel(difference)}</p>
            <p className="text-xs text-muted-foreground">
              {invoice.status === 'MATCHED' &&
                'Coincidió con lo recibido: la cuenta por pagar quedó en firme al cargarla.'}
              {invoice.status === 'APPROVED' &&
                'Se aceptó la diferencia: la deuda es la de la factura.'}
              {pending &&
                'La deuda sigue siendo la estimada hasta que alguien apruebe o rechace esta factura.'}
              {invoice.status === 'REJECTED' &&
                'Se reclama al proveedor. Las recepciones quedaron libres para cargar la factura corregida.'}
            </p>
            {invoice.reviewedAt && (
              <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                <p>
                  {invoice.status === 'REJECTED' ? 'Rechazada' : 'Aprobada'} por{' '}
                  {person(invoice.reviewedBy)} el {formatDatePY(invoice.reviewedAt, 'local')}
                </p>
                {invoice.reviewNote && <p className="mt-1">Motivo: {invoice.reviewNote}</p>}
              </div>
            )}
          </Card>

          {pending && (
            <RequirePermission
              permission="procurement:payables:approve"
              fallback={
                <Card className="p-5 text-xs text-muted-foreground">
                  Esta factura espera la aprobación de alguien con permiso para aprobar
                  diferencias.
                </Card>
              }
            >
              <Card className="gap-3 p-5">
                <SectionTitle>Decisión</SectionTitle>
                {deciding === null ? (
                  <>
                    <Button className="w-full" onClick={() => setDeciding('approve')}>
                      Aprobar la diferencia
                    </Button>
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => setDeciding('reject')}
                    >
                      Rechazar y reclamar al proveedor
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {deciding === 'approve'
                        ? `La deuda pasa a ser ${gs(invoice.total)} y el plazo corre desde la fecha de la factura.`
                        : 'La deuda queda como estaba y se podrá cargar la factura corregida.'}
                    </p>
                    <Textarea
                      rows={3}
                      autoFocus
                      maxLength={500}
                      aria-label={
                        deciding === 'approve'
                          ? 'Por qué se acepta la diferencia'
                          : 'Qué se le reclama al proveedor'
                      }
                      placeholder={
                        deciding === 'approve'
                          ? 'Por qué se acepta (opcional)'
                          : 'Qué se le reclama al proveedor'
                      }
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    {error && (
                      <p role="alert" className="text-xs text-destructive">
                        {error}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        variant={deciding === 'reject' ? 'destructive' : 'default'}
                        onClick={decide}
                        disabled={mutation.isPending}
                      >
                        {mutation.isPending
                          ? 'Guardando...'
                          : deciding === 'approve'
                            ? 'Aprobar'
                            : 'Rechazar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setDeciding(null);
                          setError('');
                        }}
                        disabled={mutation.isPending}
                      >
                        Volver
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            </RequirePermission>
          )}
        </div>
      </div>
    </div>
  );
}
