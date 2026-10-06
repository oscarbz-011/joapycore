'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Mail, PackageCheck } from 'lucide-react';
import { OrderAdvanceCard } from '@/components/procurement/order-advance-card';
import {
  ReceiveModal,
  StatusBadge,
  TEXTAREA_CLS,
  TypeBadge,
  deliveryAccentFor,
  deliveryDaysOverdue,
  formatPrice,
  orderTotal,
} from '@/components/procurement/purchase-order-shared';
import { RequirePermission } from '@/components/require-permission';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cancelAdvanceBlock } from '@/lib/advance';
import { apiErrorMessage } from '@/lib/api/api-error';
import { procurementApi, type PurchaseOrder } from '@/lib/api/procurement';
import { formatDatePY } from '@/lib/date';
import { openPdf } from '@/lib/open-pdf';
import {
  cancelReasonError,
  historyEntryLabel,
  orderActions,
  orderEmailError,
} from '@/lib/purchase-order-status';
import { cn } from '@/lib/utils';

type StatusAction = 'send' | 'confirm' | 'cancel';

const ACTION_COPY: Record<StatusAction, { question: string; yes: string; busy: string }> = {
  send: {
    question: '¿Marcar la orden como enviada al proveedor?',
    yes: 'Sí, enviada',
    busy: 'Guardando...',
  },
  confirm: {
    question: '¿El proveedor confirmó esta orden?',
    yes: 'Sí, confirmada',
    busy: 'Confirmando...',
  },
  cancel: {
    question: 'Cancelar la orden. El motivo queda en el historial.',
    yes: 'Cancelar la orden',
    busy: 'Cancelando...',
  },
};

const ORDERS_PATH = '/dashboard/procurement';

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={cn('mt-0.5 break-words text-sm font-medium text-foreground', className)}>
        {children}
      </dd>
    </div>
  );
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Asuncion',
  });

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showReceive, setShowReceive] = useState(false);
  const [pendingAction, setPendingAction] = useState<StatusAction | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [emailing, setEmailing] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [documentNote, setDocumentNote] = useState<{ ok: boolean; text: string } | null>(null);

  const {
    data: order,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => procurementApi.getOrder(id),
  });

  const { data: receipts = [] } = useQuery({
    queryKey: ['purchase-receipts', id],
    queryFn: () => procurementApi.listReceipts(id),
    enabled: !!order && order.status !== 'PENDING' && order.status !== 'SENT',
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-receipts', id] });
  }

  function closeAction() {
    setPendingAction(null);
    setCancelReason('');
    setActionError('');
  }

  const statusMutation = useMutation({
    mutationFn: (action: StatusAction) =>
      action === 'send'
        ? procurementApi.sendOrder(id)
        : action === 'confirm'
          ? procurementApi.confirmOrder(id)
          : procurementApi.cancelOrder(id, cancelReason.trim()),
    onSuccess: (updated) => {
      queryClient.setQueryData(['purchase-order', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      closeAction();
    },
    onError: (err) => {
      setActionError(apiErrorMessage(err, 'No se pudo cambiar el estado de la orden'));
      // Si otro usuario la movió, lo que se ve ya no es cierto.
      refresh();
    },
  });

  const pdfMutation = useMutation({
    mutationFn: () => procurementApi.orderPdf(id),
    onSuccess: (updated) => {
      // Esta respuesta no trae el saldo del anticipo: se actualiza solo el PDF.
      queryClient.setQueryData<PurchaseOrder>(['purchase-order', id], (current) =>
        current ? { ...current, pdfFileId: updated.pdfFileId } : updated,
      );
      if (updated.pdfFileId) void openPdf(updated.pdfFileId);
    },
    onError: (err) =>
      setDocumentNote({ ok: false, text: apiErrorMessage(err, 'No se pudo generar el PDF') }),
  });

  const emailMutation = useMutation({
    mutationFn: () => procurementApi.emailOrder(id, emailTo.trim()),
    onSuccess: (result) => {
      setEmailing(false);
      setDocumentNote({ ok: true, text: `Orden enviada a ${result.to}` });
    },
    onError: (err) =>
      setDocumentNote({ ok: false, text: apiErrorMessage(err, 'No se pudo enviar el email') }),
  });

  function runAction() {
    if (!pendingAction) return;
    const problem = pendingAction === 'cancel' ? cancelReasonError(cancelReason) : null;
    setActionError(problem ?? '');
    if (!problem) statusMutation.mutate(pendingAction);
  }

  function sendEmail() {
    const problem = orderEmailError(emailTo);
    setDocumentNote(problem ? { ok: false, text: problem } : null);
    if (!problem) emailMutation.mutate();
  }

  const back = (
    <Link
      href={ORDERS_PATH}
      className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft size={14} aria-hidden />
      Volver a órdenes de compra
    </Link>
  );

  if (isLoading) {
    return (
      <div>
        {back}
        <div className="py-16 text-center text-sm text-muted-foreground">Cargando orden...</div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div>
        {back}
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {isError ? 'No se pudo cargar la orden.' : 'No se encontró la orden.'}
          </p>
          <div className="mt-3 flex justify-center gap-2">
            {isError && (
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Reintentar
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push(ORDERS_PATH)}>
              Ver todas las órdenes
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const actions = orderActions(order.status);
  const overdueDays = deliveryDaysOverdue(order);
  const accent = deliveryAccentFor(order);
  const tracksReceipt = order.status !== 'PENDING' && order.status !== 'SENT';
  const history = order.statusChanges ?? [];
  const cancelBlock = cancelAdvanceBlock(order.advance);
  const hasImportData =
    order.purchaseType === 'IMPORT' &&
    (order.exchangeRate || order.customsDuty || order.customsRef);

  return (
    <div>
      {back}

      {/* Encabezado */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-sm text-muted-foreground">
            {order.orderNumber ?? 'Orden sin número'}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
            {order.supplier.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={order.status} deliveryOverdueDays={overdueDays} />
            <TypeBadge type={order.purchaseType} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Total estimado
          </p>
          <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
            {formatPrice(orderTotal(order))}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Columna principal */}
        <div className="min-w-0 space-y-6">
          <Card className="gap-4 p-5">
            <SectionTitle>Datos de la orden</SectionTitle>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
              <Fact label="Proveedor">
                <Link
                  href={`/dashboard/procurement/suppliers/${order.supplier.id}`}
                  className="hover:underline"
                >
                  {order.supplier.name}
                </Link>
              </Fact>
              <Fact label="Email del proveedor">
                {order.supplier.email ?? (
                  <span className="font-normal text-muted-foreground">Sin cargar</span>
                )}
              </Fact>
              <Fact label="Fecha de la orden">{formatDatePY(order.orderDate, 'utc')}</Fact>
              <Fact
                label="Entrega estimada"
                className={cn(
                  accent === 'destructive' && 'text-destructive',
                  accent === 'warn' && 'text-warn',
                )}
              >
                {order.expectedDate ? (
                  formatDatePY(order.expectedDate, 'utc')
                ) : (
                  <span className="font-normal text-muted-foreground">A convenir</span>
                )}
              </Fact>
            </dl>
            {hasImportData && (
              <dl className="grid gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-3">
                <Fact label="Tipo de cambio">
                  {order.exchangeRate ? Number(order.exchangeRate).toFixed(4) : '—'}
                </Fact>
                <Fact label="Arancel">
                  {order.customsDuty ? `${Number(order.customsDuty)}%` : '—'}
                </Fact>
                <Fact label="Ref. aduanera" className="font-mono">
                  {order.customsRef ?? '—'}
                </Fact>
              </dl>
            )}
          </Card>

          <Card className="gap-0 overflow-hidden p-0">
            <div className="px-5 py-4">
              <SectionTitle>Productos</SectionTitle>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-y border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 text-left whitespace-nowrap">Cód. proveedor</th>
                    <th className="px-4 py-3 text-left">Producto</th>
                    <th className="px-4 py-3 text-left">Modelo</th>
                    <th className="px-4 py-3 text-right">Cantidad</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Costo unit.</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                    {tracksReceipt && <th className="px-4 py-3 text-left">Recibido</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {order.items.map((item) => {
                    const percent =
                      item.quantity > 0 ? (item.receivedQty / item.quantity) * 100 : 0;
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-muted-foreground">
                          {item.supplierSku ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {item.product.name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {item.product.model ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-foreground">
                          {item.quantity} {item.product.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap text-muted-foreground">
                          {formatPrice(Number(item.unitCost))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium tabular-nums whitespace-nowrap text-foreground">
                          {formatPrice(item.quantity * Number(item.unitCost))}
                        </td>
                        {tracksReceipt && (
                          <td className="px-4 py-3">
                            <div className="flex min-w-28 items-center gap-2">
                              <div
                                className="h-1.5 flex-1 rounded-full bg-muted/30"
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={item.quantity}
                                aria-valuenow={item.receivedQty}
                                aria-label={`Recibido de ${item.product.name}`}
                              >
                                <div
                                  className="h-1.5 rounded-full bg-emerald-500 transition-all"
                                  style={{ width: `${Math.min(percent, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                                {item.receivedQty}/{item.quantity}
                              </span>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/20">
                    <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground">
                      Total estimado
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-base font-bold tabular-nums whitespace-nowrap text-foreground">
                      {formatPrice(orderTotal(order))}
                    </td>
                    {tracksReceipt && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {tracksReceipt && (
            <Card className="gap-0 overflow-hidden p-0">
              <div className="px-5 py-4">
                <SectionTitle>Recepciones de mercadería</SectionTitle>
              </div>
              {receipts.length === 0 ? (
                <p className="border-t border-border px-5 py-6 text-sm text-muted-foreground">
                  Todavía no se recibió mercadería de esta orden.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13.5px]">
                    <thead>
                      <tr className="border-y border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 text-left whitespace-nowrap">N° recepción</th>
                        <th className="px-4 py-3 text-left">Fecha</th>
                        <th className="px-4 py-3 text-left">Depósito</th>
                        <th className="px-4 py-3 text-left">Producto</th>
                        <th className="px-4 py-3 text-left">Lote</th>
                        <th className="px-4 py-3 text-right">Cantidad</th>
                        <th className="px-4 py-3 text-left">Recibió</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {receipts.flatMap((receipt) =>
                        receipt.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                              #{receipt.receiptNumber}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                              {formatDatePY(receipt.receivedAt, 'local')}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {receipt.warehouse?.name ?? '—'}
                            </td>
                            <td className="px-4 py-3 font-medium text-foreground">
                              {item.product.name}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {item.batchNumber ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-foreground">
                              {item.quantity}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {receipt.createdBy
                                ? `${receipt.createdBy.firstName} ${receipt.createdBy.lastName}`
                                : '—'}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {order.notes && (
            <Card className="gap-2 p-5">
              <SectionTitle>Notas</SectionTitle>
              <p className="text-sm whitespace-pre-line text-foreground">{order.notes}</p>
            </Card>
          )}
        </div>

        {/* Columna lateral: acciones e historial, siempre a la vista */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card className="gap-3 p-5">
            <SectionTitle>Acciones</SectionTitle>

            <RequirePermission permission="procurement:receive">
              {actions.receive && (
                <Button className="w-full" onClick={() => setShowReceive(true)}>
                  <PackageCheck size={15} />
                  Registrar recepción de mercadería
                </Button>
              )}
            </RequirePermission>

            <RequirePermission permission="procurement:update">
              {pendingAction === null ? (
                <>
                  {actions.send && (
                    <Button className="w-full" onClick={() => setPendingAction('send')}>
                      Marcar como enviada al proveedor
                    </Button>
                  )}
                  {actions.confirm && (
                    <Button
                      className="w-full"
                      variant={actions.send ? 'outline' : 'default'}
                      onClick={() => setPendingAction('confirm')}
                    >
                      Confirmada por el proveedor
                    </Button>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    {ACTION_COPY[pendingAction].question}
                  </p>
                  {pendingAction === 'cancel' && cancelBlock && (
                    <p role="alert" className="mb-2 text-xs text-warn">
                      {cancelBlock}
                    </p>
                  )}
                  {pendingAction === 'cancel' && !cancelBlock && (
                    <textarea
                      className={cn(TEXTAREA_CLS, 'mb-2')}
                      rows={3}
                      autoFocus
                      aria-label="Motivo de la cancelación"
                      placeholder="Motivo de la cancelación..."
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                  )}
                  {actionError && (
                    <p role="alert" className="mb-2 text-xs text-destructive">
                      {actionError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      variant={pendingAction === 'cancel' ? 'destructive' : 'default'}
                      onClick={runAction}
                      disabled={
                        statusMutation.isPending || (pendingAction === 'cancel' && !!cancelBlock)
                      }
                    >
                      {statusMutation.isPending
                        ? ACTION_COPY[pendingAction].busy
                        : ACTION_COPY[pendingAction].yes}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={closeAction}
                      disabled={statusMutation.isPending}
                    >
                      Volver
                    </Button>
                  </div>
                </div>
              )}
            </RequirePermission>

            {order.status !== 'CANCELLED' && (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setDocumentNote(null);
                      pdfMutation.mutate();
                    }}
                    disabled={pdfMutation.isPending}
                  >
                    <FileText size={15} />
                    {pdfMutation.isPending ? 'Generando...' : 'Ver PDF'}
                  </Button>
                  <RequirePermission permission="procurement:update">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setDocumentNote(null);
                        setEmailTo(order.supplier.email ?? '');
                        setEmailing((value) => !value);
                      }}
                    >
                      <Mail size={15} />
                      Enviar por email
                    </Button>
                  </RequirePermission>
                </div>
                {emailing && (
                  <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                    <Label htmlFor="order-email-to" className="mb-1.5 text-xs">
                      Enviar el PDF de la orden a
                    </Label>
                    <Input
                      id="order-email-to"
                      type="email"
                      autoFocus
                      placeholder="email del proveedor"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') sendEmail();
                      }}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={sendEmail}
                        disabled={emailMutation.isPending}
                      >
                        {emailMutation.isPending ? 'Enviando...' : 'Enviar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setEmailing(false)}
                        disabled={emailMutation.isPending}
                      >
                        Volver
                      </Button>
                    </div>
                  </div>
                )}
                {documentNote && (
                  <p
                    role={documentNote.ok ? 'status' : 'alert'}
                    className={cn(
                      'text-xs',
                      documentNote.ok ? 'text-muted-foreground' : 'text-destructive',
                    )}
                  >
                    {documentNote.text}
                  </p>
                )}
              </div>
            )}

            <RequirePermission permission="procurement:update">
              {actions.cancel && pendingAction === null && (
                <Button
                  variant="ghost"
                  className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setPendingAction('cancel')}
                >
                  Cancelar orden
                </Button>
              )}
            </RequirePermission>
          </Card>

          <OrderAdvanceCard order={order} onChanged={refresh} />

          <Card className="gap-3 p-5">
            <SectionTitle>Historial</SectionTitle>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
            ) : (
              <ol className="space-y-4">
                {history.map((change, index) => (
                  <li
                    key={change.id}
                    className={cn(
                      'relative pl-5 before:absolute before:left-0 before:top-1.5 before:h-2 before:w-2 before:rounded-full',
                      index === history.length - 1
                        ? 'before:bg-primary'
                        : 'before:bg-muted-foreground/40',
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">
                      {historyEntryLabel(change)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dateTime(change.createdAt)}
                      {change.changedBy &&
                        ` · ${change.changedBy.firstName} ${change.changedBy.lastName}`}
                    </p>
                    {change.reason && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Motivo: {change.reason}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      {showReceive && (
        <ReceiveModal
          order={order}
          open={showReceive}
          onOpenChange={setShowReceive}
          onSaved={() => {
            setShowReceive(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
