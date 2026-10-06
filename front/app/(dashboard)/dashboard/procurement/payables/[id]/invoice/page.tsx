'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { RequirePermission } from '@/components/require-permission';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api/api-error';
import { payablesApi } from '@/lib/api/payables';
import { supplierInvoicesApi } from '@/lib/api/supplier-invoices';
import { formatDatePY, todayISODate } from '@/lib/date';
import {
  differenceLabel,
  invoiceFormError,
  invoicePreview,
  type InvoiceLine,
} from '@/lib/supplier-invoice';
import { cn } from '@/lib/utils';

const PAYABLES_PATH = '/dashboard/procurement/payables';
const gs = (n: number) => 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
const amount = (value: string) => {
  const n = Number(value.replace(',', '.'));
  return value.trim() && Number.isFinite(n) ? n : 0;
};

const TH = 'px-4 py-3 text-left whitespace-nowrap';
const HEAD =
  'border-y border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground';

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

export default function NewSupplierInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<string[]>([id]);
  // Solo lo que se tocó: el resto vale lo recibido.
  const [edits, setEdits] = useState<Record<string, { quantity?: string; unitCost?: string }>>({});
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [timbrado, setTimbrado] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayISODate());
  const [shipping, setShipping] = useState('');
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const payableQuery = useQuery({
    queryKey: ['accounts-payable', id],
    queryFn: () => payablesApi.getAP(id),
  });
  const payable = payableQuery.data;
  const supplierId = payable?.supplier.id;

  const receiptsQuery = useQuery({
    queryKey: ['invoiceable-payables', supplierId],
    queryFn: () => supplierInvoicesApi.invoiceable(supplierId!),
    enabled: !!supplierId,
  });
  const receipts = receiptsQuery.data ?? [];
  const chosen = receipts.filter((receipt) => selected.includes(receipt.id));

  const lines: (InvoiceLine & { receiptNumber: number; unit: string })[] = chosen.flatMap(
    (receipt) =>
      receipt.purchaseReceipt.items.map((item) => {
        const edit = edits[item.id] ?? {};
        return {
          receiptItemId: item.id,
          productName: item.product.name,
          unit: item.product.unit,
          receiptNumber: receipt.purchaseReceipt.receiptNumber,
          receivedQuantity: item.quantity,
          receivedUnitCost: item.unitCost,
          quantity: edit.quantity === undefined ? item.quantity : amount(edit.quantity),
          unitCost: edit.unitCost === undefined ? item.unitCost : amount(edit.unitCost),
        };
      }),
  );
  const header = {
    invoiceNumber,
    invoiceDate,
    shipping: amount(shipping),
    discount: amount(discount),
  };
  const preview = invoicePreview(lines, header.shipping, header.discount);

  const mutation = useMutation({
    mutationFn: () =>
      supplierInvoicesApi.create({
        supplierId: supplierId!,
        payableIds: chosen.map((receipt) => receipt.id),
        invoiceNumber: invoiceNumber.trim(),
        timbrado: timbrado.trim() || undefined,
        invoiceDate,
        shippingAmount: header.shipping || undefined,
        discountAmount: header.discount || undefined,
        notes: notes.trim() || undefined,
        lines: lines.map((line) => ({
          purchaseReceiptItemId: line.receiptItemId,
          quantity: line.quantity,
          unitCost: line.unitCost,
        })),
      }),
    onSuccess: (invoice) => {
      void queryClient.invalidateQueries({ queryKey: ['accounts-payable'] });
      void queryClient.invalidateQueries({ queryKey: ['invoiceable-payables'] });
      router.push(`${PAYABLES_PATH}/invoices/${invoice.id}`);
    },
    onError: (err) => {
      setError(apiErrorMessage(err, 'No se pudo cargar la factura'));
      // Otra persona pudo haber facturado alguna recepción.
      void receiptsQuery.refetch();
    },
  });

  function toggle(receiptId: string, checked: boolean) {
    setSelected((prev) =>
      checked ? [...prev, receiptId] : prev.filter((value) => value !== receiptId),
    );
  }

  function edit(itemId: string, patch: { quantity?: string; unitCost?: string }) {
    setEdits((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
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

  if (payableQuery.isLoading || (supplierId && receiptsQuery.isLoading)) {
    return (
      <div>
        {back}
        <p className="py-16 text-center text-sm text-muted-foreground">Cargando recepciones...</p>
      </div>
    );
  }

  if (payableQuery.isError || receiptsQuery.isError || !payable) {
    return (
      <div>
        {back}
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">No se pudieron cargar los datos.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              void payableQuery.refetch();
              void receiptsQuery.refetch();
            }}
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  // La cuenta ya tiene una factura vigente: no se carga otra encima.
  if (!receipts.some((receipt) => receipt.id === id)) {
    return (
      <div>
        {back}
        <Card className="mx-auto max-w-lg gap-3 p-6 text-center">
          <p className="text-sm text-foreground">
            {payable.supplierInvoice
              ? `Esta recepción ya tiene cargada la factura ${payable.supplierInvoice.invoiceNumber}.`
              : 'Esta cuenta ya no admite una factura.'}
          </p>
          {payable.supplierInvoice && (
            <Button
              variant="outline"
              onClick={() =>
                router.push(`${PAYABLES_PATH}/invoices/${payable.supplierInvoice!.id}`)
              }
            >
              Ver la factura
            </Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div>
      {back}
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Factura del proveedor</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
          {payable.supplier.name}
        </h1>
      </div>

      <form
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
        onSubmit={(e) => {
          e.preventDefault();
          const problem = invoiceFormError(header, lines);
          setError(problem ?? '');
          if (!problem) mutation.mutate();
        }}
      >
        <div className="min-w-0 space-y-6">
          <Card className="gap-4 p-5">
            <SectionTitle>Datos de la factura</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="invoice-number">Número *</Label>
                <Input
                  id="invoice-number"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="001-001-0000123"
                  maxLength={40}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoice-timbrado">Timbrado</Label>
                <Input
                  id="invoice-timbrado"
                  value={timbrado}
                  onChange={(e) => setTimbrado(e.target.value)}
                  maxLength={20}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de la factura *</Label>
                <DatePicker value={invoiceDate} onChange={setInvoiceDate} />
                <p className="text-xs text-muted-foreground">
                  El plazo de pago del proveedor se cuenta desde esta fecha.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoice-shipping">Envío facturado (Gs.)</Label>
                <Input
                  id="invoice-shipping"
                  type="number"
                  min={0}
                  step="any"
                  value={shipping}
                  onChange={(e) => setShipping(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoice-discount">Descuento facturado (Gs.)</Label>
                <Input
                  id="invoice-discount"
                  type="number"
                  min={0}
                  step="any"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-notes">Notas</Label>
              <Textarea
                id="invoice-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
              />
            </div>
          </Card>

          <Card className="gap-0 overflow-hidden p-0">
            <div className="space-y-1 px-5 py-4">
              <SectionTitle>Recepciones que cubre la factura</SectionTitle>
              <p className="text-xs text-muted-foreground">
                Una factura puede ser de una sola entrega o de varias del mismo proveedor.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className={HEAD}>
                    <th className={TH}>Incluir</th>
                    <th className={TH}>N° recepción</th>
                    <th className={TH}>Orden</th>
                    <th className={TH}>Recibida</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {receipts.map((receipt) => {
                    const label = `Recepción #${receipt.purchaseReceipt.receiptNumber}`;
                    return (
                      <tr key={receipt.id}>
                        <td className="px-4 py-3">
                          <Checkbox
                            aria-label={`Incluir ${label}`}
                            checked={selected.includes(receipt.id)}
                            onCheckedChange={(checked) => toggle(receipt.id, checked === true)}
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          #{receipt.purchaseReceipt.receiptNumber}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {receipt.purchaseReceipt.purchaseOrder.orderNumber ?? '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {formatDatePY(receipt.purchaseReceipt.receivedAt, 'local')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap text-foreground">
                          {gs(receipt.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="gap-0 overflow-hidden p-0">
            <div className="space-y-1 px-5 py-4">
              <SectionTitle>Lo que dice la factura</SectionTitle>
              <p className="text-xs text-muted-foreground">
                Viene cargado lo que se recibió. Cambiá solo lo que la factura diga distinto; si
                una línea no fue facturada, poné cantidad 0.
              </p>
            </div>
            {lines.length === 0 ? (
              <p className="border-t border-border px-5 py-6 text-sm text-muted-foreground">
                Elegí al menos una recepción.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className={HEAD}>
                      <th className={TH}>Recepción</th>
                      <th className={TH}>Producto</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Recibido</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Costo de la orden</th>
                      <th className={TH}>Cant. facturada</th>
                      <th className={TH}>Precio facturado</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line) => {
                      const differs =
                        line.quantity !== line.receivedQuantity ||
                        Math.abs(line.unitCost - line.receivedUnitCost) > 0.005;
                      return (
                        <tr key={line.receiptItemId} className={cn(differs && 'bg-warn-subtle/40')}>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            #{line.receiptNumber}
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">
                            {line.productName}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                            {line.receivedQuantity} {line.unit}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap text-muted-foreground">
                            {gs(line.receivedUnitCost)}
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="w-24"
                              aria-label={`Cantidad facturada de ${line.productName}`}
                              value={
                                edits[line.receiptItemId]?.quantity ??
                                String(line.receivedQuantity)
                              }
                              onChange={(e) =>
                                edit(line.receiptItemId, { quantity: e.target.value })
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              className="w-32"
                              aria-label={`Precio facturado de ${line.productName}`}
                              value={
                                edits[line.receiptItemId]?.unitCost ??
                                String(line.receivedUnitCost)
                              }
                              onChange={(e) =>
                                edit(line.receiptItemId, { unitCost: e.target.value })
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium tabular-nums whitespace-nowrap text-foreground">
                            {gs(line.quantity * line.unitCost)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card className="gap-3 p-5">
            <SectionTitle>Resumen</SectionTitle>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Líneas facturadas</dt>
                <dd className="font-mono tabular-nums">{gs(preview.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Envío</dt>
                <dd className="font-mono tabular-nums">{gs(header.shipping)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Descuento</dt>
                <dd className="font-mono tabular-nums">− {gs(header.discount)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-border pt-1.5">
                <dt className="font-semibold text-foreground">Total de la factura</dt>
                <dd className="font-mono font-bold tabular-nums">{gs(preview.total)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Estimado al recibir</dt>
                <dd className="font-mono tabular-nums text-muted-foreground">
                  {gs(preview.estimated)}
                </dd>
              </div>
            </dl>
            <p
              role="status"
              className={cn(
                'rounded-lg border px-3 py-2 text-xs',
                preview.needsApproval
                  ? 'border-warn/30 bg-warn-subtle text-warn'
                  : 'border-border bg-muted/20 text-muted-foreground',
              )}
            >
              {preview.needsApproval
                ? `${differenceLabel(preview.difference)}. La factura difiere de lo recibido: queda esperando aprobación y la deuda no cambia hasta entonces.`
                : 'Coincide con lo recibido: la cuenta por pagar queda en firme al guardar.'}
            </p>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <RequirePermission
              permission="procurement:payables:register"
              fallback={
                <p className="text-xs text-muted-foreground">
                  No tenés permiso para cargar facturas de proveedores.
                </p>
              }
            >
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'Guardando...' : 'Cargar factura'}
              </Button>
            </RequirePermission>
          </Card>
        </div>
      </form>
    </div>
  );
}
