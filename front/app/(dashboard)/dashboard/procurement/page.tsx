'use client';

import { RequirePermission } from '@/components/require-permission';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, FileText, Mail, Plus, X, Trash2, AlertTriangle } from 'lucide-react';
import { openPdf } from '@/lib/open-pdf';
import { CatalogItemPicker } from '@/components/procurement/catalog-item-picker';
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_STATUS_LABEL,
  cancelReasonError,
  historyEntryLabel,
  orderActions,
  orderEmailError,
} from '@/lib/purchase-order-status';
import { localISODate } from '@/lib/date';
import {
  emptyLine,
  lineFromCatalogItem,
  orderLinesError,
  orderLinesTotal,
  toOrderItems,
  withoutCatalogLines,
  type OrderLine,
} from '@/lib/purchase-order-lines';
import {
  procurementApi,
  type PurchaseOrder,
  type PurchaseOrderStatus,
  type PurchaseType,
  type ReceiptItemPayload,
  type Supplier,
} from '../../../../lib/api/procurement';
import { inventoryApi, type Product } from '../../../../lib/api/inventory';
import { warehousesApi } from '../../../../lib/api/warehouses';
import { daysOverdue } from '../../../../lib/overdue';
import { formatDatePY, todayISODate } from '../../../../lib/date';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

function orderTotal(order: PurchaseOrder) {
  return order.items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unitCost), 0);
}

// Mismo diseño de resaltado que Pagos/Financiamiento/Reportes: rojo si la
// entrega esperada ya pasó y la orden sigue esperando mercadería, ámbar si
// todavía está dentro de plazo. Una orden en borrador (PENDING, aún no
// confirmada al proveedor) no cuenta — la fecha ahí es solo un estimado
// propio, no un compromiso real.
function deliveryDaysOverdue(order: PurchaseOrder): number {
  const stillOwed = order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED';
  if (!stillOwed || !order.expectedDate) return 0;
  return Math.max(0, daysOverdue(order.expectedDate));
}

function deliveryAccentFor(order: PurchaseOrder): 'destructive' | 'warn' | null {
  const stillOwed = order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED';
  if (!stillOwed || !order.expectedDate) return null;
  return deliveryDaysOverdue(order) > 0 ? 'destructive' : 'warn';
}

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';
const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

// ── Sub-nav ────────────────────────────────────────────────────────────────────

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<PurchaseOrderStatus, { label: string; className?: string; destructive?: boolean }> = {
  PENDING:              { label: PURCHASE_ORDER_STATUS_LABEL.PENDING,            className: 'bg-muted/30 text-muted-foreground border-border' },
  SENT:                 { label: PURCHASE_ORDER_STATUS_LABEL.SENT,               className: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800' },
  CONFIRMED:            { label: PURCHASE_ORDER_STATUS_LABEL.CONFIRMED,          className: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800' },
  PARTIALLY_RECEIVED:   { label: PURCHASE_ORDER_STATUS_LABEL.PARTIALLY_RECEIVED, className: 'bg-warn-subtle text-warn border-warn/30' },
  RECEIVED:             { label: PURCHASE_ORDER_STATUS_LABEL.RECEIVED,           className: 'bg-accent-subtle text-accent-on border-accent-on/20' },
  CANCELLED:            { label: PURCHASE_ORDER_STATUS_LABEL.CANCELLED,          destructive: true },
};

function StatusBadge({ status, deliveryOverdueDays }: { status: PurchaseOrderStatus; deliveryOverdueDays?: number }) {
  if (deliveryOverdueDays && deliveryOverdueDays > 0) {
    return (
      <Badge variant="destructive" className="gap-1 whitespace-nowrap">
        <AlertTriangle size={10} />
        Entrega vencida · {deliveryOverdueDays} {deliveryOverdueDays === 1 ? 'día' : 'días'}
      </Badge>
    );
  }
  const { label, className, destructive } = STATUS_MAP[status];
  return (
    <Badge variant={destructive ? 'destructive' : 'outline'} className={className}>
      {label}
    </Badge>
  );
}

function TypeBadge({ type }: { type: PurchaseType }) {
  return type === 'IMPORT' ? (
    <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800">
      Importación
    </Badge>
  ) : (
    <Badge variant="secondary">Local</Badge>
  );
}

// ── Create order modal ─────────────────────────────────────────────────────────

function CreateOrderModal({
  open,
  onOpenChange,
  suppliers,
  products,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  suppliers: Supplier[];
  products: Product[];
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [purchaseType, setPurchaseType] = useState<PurchaseType>('LOCAL');
  const [orderDate, setOrderDate] = useState(todayISODate());
  const [expectedDate, setExpectedDate] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [customsDuty, setCustomsDuty] = useState('');
  const [customsRef, setCustomsRef] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderLine[]>([]);
  const [pickingCatalog, setPickingCatalog] = useState(false);
  const [error, setError] = useState('');
  const supplier = suppliers.find((s) => s.id === supplierId);

  // Las líneas tomadas del catálogo son del proveedor elegido.
  function changeSupplier(id: string) {
    setSupplierId(id);
    setItems((prev) => withoutCatalogLines(prev));
  }

  function patchLine(key: string, patch: Partial<OrderLine>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  const isImport = purchaseType === 'IMPORT';

  function handleProductChange(key: string, productId: string) {
    const product = products.find((p) => p.id === productId) ?? null;
    patchLine(key, {
      productId,
      productName: product?.name ?? '',
      unitCost: product ? Number(product.costPrice) : 0,
    });
  }

  const total = orderLinesTotal(items);

  const mutation = useMutation({
    mutationFn: () =>
      procurementApi.createOrder({
        supplierId,
        purchaseType,
        orderDate,
        expectedDate: expectedDate || undefined,
        exchangeRate: exchangeRate ? Number(exchangeRate) : undefined,
        customsDuty: customsDuty ? Number(customsDuty) : undefined,
        customsRef: customsRef.trim() || undefined,
        notes: notes.trim() || undefined,
        items: toOrderItems(items),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      onSaved();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al crear la orden'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-0 sm:max-w-4xl p-0 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-card z-10">
          <DialogTitle>Nueva orden de compra</DialogTitle>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const problem = !supplierId ? 'Elegí el proveedor' : orderLinesError(items);
            setError(problem ?? '');
            if (!problem) mutation.mutate();
          }}
          className="px-6 py-5 space-y-5"
        >
          {/* Proveedor + tipo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Proveedor *</Label>
              <Select value={supplierId || 'none'} onValueChange={(v) => changeSupplier(v && v !== 'none' ? v : '')}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">{supplier?.name ?? '— Seleccionar —'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seleccionar —</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tipo de compra *</Label>
              <Select value={purchaseType} onValueChange={(v) => setPurchaseType(v as PurchaseType)}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">{purchaseType === 'IMPORT' ? 'Importación' : 'Local'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOCAL">Local</SelectItem>
                  <SelectItem value="IMPORT">Importación</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Fecha de orden *</Label>
              <DatePicker value={orderDate} onChange={setOrderDate} />
            </div>
            <div className="space-y-1">
              <Label>Fecha esperada de entrega</Label>
              <DatePicker value={expectedDate} onChange={setExpectedDate} />
            </div>
          </div>

          {/* Campos de importación */}
          {isImport && (
            <div className="rounded-xl bg-violet-50 border border-violet-100 dark:bg-violet-950 dark:border-violet-800 px-4 py-3 space-y-3">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
                Datos de importación
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-violet-700 dark:text-violet-300">Tipo de cambio</Label>
                  <input type="number" min={0} step="0.0001" className={NUM_CLS} placeholder="7350.0000" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-violet-700 dark:text-violet-300">Arancel aduanero (%)</Label>
                  <input type="number" min={0} max={100} step="0.01" className={NUM_CLS} placeholder="10.00" value={customsDuty} onChange={(e) => setCustomsDuty(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-violet-700 dark:text-violet-300">Ref. aduanera</Label>
                  <Input placeholder="DUA-2026-001" value={customsRef} onChange={(e) => setCustomsRef(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Productos */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Productos</p>
              <Link
                href="/dashboard/procurement/compare-prices"
                target="_blank"
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Comparar proveedores
              </Link>
            </div>
            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                {supplierId
                  ? 'Agregá ítems del catálogo del proveedor o productos sueltos.'
                  : 'Elegí el proveedor para ver su catálogo.'}
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.key} className="rounded-xl border border-border p-3">
                    <div className="flex gap-2 items-center">
                      <div className="min-w-0 flex-1">
                        {item.catalogItemId ? (
                          <>
                            <p className="truncate text-sm font-medium text-foreground">{item.productName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              Cód. proveedor <span className="font-mono">{item.supplierSku}</span>
                            </p>
                          </>
                        ) : (
                          <Select value={item.productId || 'none'} onValueChange={(v) => handleProductChange(item.key, v && v !== 'none' ? v : '')}>
                            <SelectTrigger className="w-full" aria-label="Producto">
                              <span className="flex-1 text-left text-sm truncate">{item.productName || '— Seleccionar producto —'}</span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Seleccionar producto —</SelectItem>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}{p.model ? ` (${p.model})` : ''}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="w-20">
                        <input
                          type="number" min={1} placeholder="Cant." aria-label="Cantidad" className={NUM_CLS}
                          value={item.quantity || ''}
                          onChange={(e) => patchLine(item.key, { quantity: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="w-32">
                        <input
                          type="number" min={0} placeholder="Costo unit." aria-label="Costo unitario" className={NUM_CLS}
                          value={item.unitCost || ''}
                          onChange={(e) => patchLine(item.key, { unitCost: parseFloat(e.target.value) || 0, priceNote: null })}
                        />
                      </div>
                      <div className="w-28 text-right text-sm font-medium text-muted-foreground tabular-nums">
                        {formatPrice(item.quantity * item.unitCost)}
                      </div>
                      <button
                        type="button"
                        aria-label="Quitar línea"
                        onClick={() => setItems((prev) => prev.filter((it) => it.key !== item.key))}
                        className="text-muted-foreground/60 hover:text-destructive"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {item.priceNote && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-warn">
                        <AlertTriangle size={12} aria-hidden />
                        {item.priceNote}. Revisá el costo antes de crear la orden.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!supplierId}
                onClick={() => setPickingCatalog(true)}
              >
                <BookOpen size={14} />
                Agregar del catálogo
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setItems((prev) => [...prev, emptyLine()])}
              >
                <Plus size={14} />
                Agregar producto suelto
              </Button>
            </div>
          </div>

          {items.length > 0 && (
            <div className="flex justify-end border-t border-border pt-3">
              <span className="text-sm text-muted-foreground mr-3">Total estimado</span>
              <span className="text-sm font-bold text-foreground">{formatPrice(total)}</span>
            </div>
          )}

          {/* Notas */}
          <div className="space-y-1">
            <Label>Notas (opcional)</Label>
            <textarea
              className={TEXTAREA_CLS}
              rows={2}
              placeholder="Condiciones de pago, instrucciones..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando...' : 'Crear orden'}
            </Button>
          </div>
        </form>

        {pickingCatalog && supplier && (
          <CatalogItemPicker
            supplierId={supplier.id}
            supplierName={supplier.name}
            orderedProductIds={new Set(items.flatMap((it) => it.productId || []))}
            onPick={(catalogItem) => {
              const line = lineFromCatalogItem(catalogItem, localISODate(new Date()));
              if (!line) return;
              setItems((prev) =>
                prev.some((it) => it.productId === line.productId) ? prev : [...prev, line],
              );
            }}
            onClose={() => setPickingCatalog(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Receive modal (crea una recepción propia — documento separado de la OC) ────

interface ReceiptLineState {
  quantity: number;
  serials: string;
  batchNumber: string;
  expiresAt: string;
}

function ReceiveModal({
  order,
  open,
  onOpenChange,
  onSaved,
}: {
  order: PurchaseOrder;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const pendingItems = order.items.filter((i) => i.receivedQty < i.quantity);
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Record<string, ReceiptLineState>>(
    Object.fromEntries(
      pendingItems.map((i) => [
        i.id,
        { quantity: i.quantity - i.receivedQty, serials: '', batchNumber: '', expiresAt: '' },
      ]),
    ),
  );
  const [error, setError] = useState('');

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: warehousesApi.listWarehouses,
  });

  function updateLine(itemId: string, patch: Partial<ReceiptLineState>) {
    setLines((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  const mutation = useMutation({
    mutationFn: () => {
      const items: ReceiptItemPayload[] = pendingItems.map((item) => {
        const line = lines[item.id];
        return {
          purchaseOrderItemId: item.id,
          quantity: Number(line.quantity),
          batchNumber: item.product.usesLots && line.batchNumber.trim() ? line.batchNumber.trim() : undefined,
          expiresAt: item.product.usesLots && line.expiresAt ? line.expiresAt : undefined,
          serialNumbers: item.product.isSerialized
            ? line.serials.split('\n').map((s) => s.trim()).filter(Boolean)
            : undefined,
        };
      });
      return procurementApi.createReceipt(order.id, {
        warehouseId: warehouseId || undefined,
        notes: notes.trim() || undefined,
        items,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-receipts', order.id] });
      onSaved();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al registrar recepción'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg p-0 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-card z-10">
          <DialogTitle>Registrar recepción</DialogTitle>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Ítems pendientes para <strong className="text-foreground">{order.supplier.name}</strong>:
          </p>

          <div className="space-y-1">
            <Label>Depósito de ingreso</Label>
            <Select value={warehouseId || 'none'} onValueChange={(v) => setWarehouseId(v && v !== 'none' ? v : '')}>
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">
                  {warehouses.find((w) => w.id === warehouseId)?.name ?? '— Sin especificar —'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sin especificar —</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {pendingItems.map((item) => {
            const pending = item.quantity - item.receivedQty;
            const line = lines[item.id];
            return (
              <div key={item.id} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.product.name}</p>
                    {item.product.model && <p className="text-xs text-muted-foreground/60">{item.product.model}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Saldo pendiente: <strong>{pending}</strong> {item.product.unit}
                  </span>
                </div>

                {item.product.isSerialized ? (
                  <div className="space-y-1">
                    <Label>Números de serie (uno por línea — la cantidad los define)</Label>
                    <textarea
                      className={`${TEXTAREA_CLS} font-mono text-xs`}
                      rows={Math.min(pending, 5)}
                      placeholder={'SN001\nSN002'}
                      value={line.serials}
                      onChange={(e) => updateLine(item.id, { serials: e.target.value })}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label>Cantidad a recibir ahora</Label>
                      <input
                        type="number"
                        min={1}
                        max={pending}
                        className={NUM_CLS}
                        value={line.quantity || ''}
                        onChange={(e) =>
                          updateLine(item.id, { quantity: Math.min(pending, parseInt(e.target.value) || 1) })
                        }
                      />
                    </div>
                    {item.product.usesLots && (
                      <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/20 p-3">
                        <div className="space-y-1">
                          <Label>Número de lote</Label>
                          <Input
                            placeholder="LOTE-001"
                            value={line.batchNumber}
                            onChange={(e) => updateLine(item.id, { batchNumber: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Vencimiento (opcional)</Label>
                          <DatePicker
                            value={line.expiresAt}
                            onChange={(v) => updateLine(item.id, { expiresAt: v })}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <div className="space-y-1">
            <Label>Notas (opcional)</Label>
            <textarea
              className={TEXTAREA_CLS}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => { setError(''); mutation.mutate(); }} disabled={mutation.isPending}>
              {mutation.isPending ? 'Registrando...' : 'Confirmar recepción'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Order detail panel ─────────────────────────────────────────────────────────

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

function OrderDetailPanel({
  order: listed,
  open,
  onOpenChange,
}: {
  order: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [showReceive, setShowReceive] = useState(false);
  const [pendingAction, setPendingAction] = useState<StatusAction | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState('');

  // La orden que llega por props es la del listado: no trae el historial y
  // queda vieja después de un cambio de estado. El detalle manda cuando está.
  const { data: detail } = useQuery({
    queryKey: ['purchase-order', listed?.id],
    queryFn: () => procurementApi.getOrder(listed!.id),
    enabled: !!listed && open,
  });
  const order = listed && detail?.id === listed.id ? detail : listed;

  const { data: receipts = [] } = useQuery({
    queryKey: ['purchase-receipts', order?.id],
    queryFn: () => procurementApi.listReceipts(order!.id),
    enabled: !!order && order.status !== 'PENDING' && order.status !== 'SENT',
  });

  function closeAction() {
    setPendingAction(null);
    setCancelReason('');
    setActionError('');
  }

  const statusMutation = useMutation({
    mutationFn: (action: StatusAction) =>
      action === 'send'
        ? procurementApi.sendOrder(order!.id)
        : action === 'confirm'
          ? procurementApi.confirmOrder(order!.id)
          : procurementApi.cancelOrder(order!.id, cancelReason.trim()),
    onSuccess: (updated) => {
      queryClient.setQueryData(['purchase-order', updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      closeAction();
    },
    onError: (err) => {
      setActionError(apiErrorMessage(err, 'No se pudo cambiar el estado de la orden'));
      // Si otro usuario la movió, lo que se ve ya no es cierto.
      void queryClient.invalidateQueries({ queryKey: ['purchase-order', order?.id] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  // ── Documento de la orden: PDF y envío por email ──
  const [emailing, setEmailing] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [documentNote, setDocumentNote] = useState<{ ok: boolean; text: string } | null>(null);

  const pdfMutation = useMutation({
    mutationFn: () => procurementApi.orderPdf(order!.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(['purchase-order', updated.id], updated);
      if (updated.pdfFileId) void openPdf(updated.pdfFileId);
    },
    onError: (err) =>
      setDocumentNote({ ok: false, text: apiErrorMessage(err, 'No se pudo generar el PDF') }),
  });

  const emailMutation = useMutation({
    mutationFn: () => procurementApi.emailOrder(order!.id, emailTo.trim()),
    onSuccess: (result) => {
      setEmailing(false);
      setDocumentNote({ ok: true, text: `Orden enviada a ${result.to}` });
      void queryClient.invalidateQueries({ queryKey: ['purchase-order', order?.id] });
    },
    onError: (err) =>
      setDocumentNote({ ok: false, text: apiErrorMessage(err, 'No se pudo enviar el email') }),
  });

  function sendEmail() {
    const problem = orderEmailError(emailTo);
    setDocumentNote(problem ? { ok: false, text: problem } : null);
    if (!problem) emailMutation.mutate();
  }

  function runAction() {
    if (!pendingAction) return;
    const problem = pendingAction === 'cancel' ? cancelReasonError(cancelReason) : null;
    setActionError(problem ?? '');
    if (!problem) statusMutation.mutate(pendingAction);
  }

  const actions = order
    ? orderActions(order.status)
    : { send: false, confirm: false, cancel: false, receive: false };
  const canReceive = actions.receive;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full max-w-sm flex-col p-0 sm:max-w-sm" showCloseButton>
          {order && (
            <>
              <SheetHeader className="border-b border-border px-5 py-4 shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <SheetTitle>
                    {order.orderNumber && (
                      <span className="mr-2 font-mono text-sm font-medium text-muted-foreground">
                        {order.orderNumber}
                      </span>
                    )}
                    {order.supplier.name}
                  </SheetTitle>
                  <StatusBadge status={order.status} />
                  <TypeBadge type={order.purchaseType} />
                </div>
                <SheetDescription>
                  Orden: {formatDatePY(order.orderDate, 'local')}
                  {order.expectedDate ? ` · Entrega est.: ${formatDatePY(order.expectedDate, 'utc')}` : ''}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto">
                {/* Import fields */}
                {order.purchaseType === 'IMPORT' && (order.exchangeRate || order.customsDuty || order.customsRef) && (
                  <div className="border-b border-border px-5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Importación</p>
                    <div className="space-y-1 text-sm">
                      {order.exchangeRate && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tipo de cambio</span>
                          <span className="text-muted-foreground">{Number(order.exchangeRate).toFixed(4)}</span>
                        </div>
                      )}
                      {order.customsDuty && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Arancel</span>
                          <span className="text-muted-foreground">{Number(order.customsDuty)}%</span>
                        </div>
                      )}
                      {order.customsRef && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ref. aduanera</span>
                          <span className="text-muted-foreground font-mono text-xs">{order.customsRef}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Items */}
                <div className="border-b border-border px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Productos</p>
                  <div className="space-y-3">
                    {order.items.map((item) => {
                      const received = item.receivedQty;
                      const total = item.quantity;
                      const pct = total > 0 ? (received / total) * 100 : 0;
                      return (
                        <div key={item.id}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">{item.product.name}</p>
                              {item.supplierSku && (
                                <p className="text-xs text-muted-foreground/60">
                                  Cód. proveedor <span className="font-mono">{item.supplierSku}</span>
                                </p>
                              )}
                              {item.product.model && <p className="text-xs text-muted-foreground/60">{item.product.model}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm text-muted-foreground">{total} × {formatPrice(Number(item.unitCost))}</p>
                              <p className="text-xs text-muted-foreground/60">Recibido: {received}/{total}</p>
                            </div>
                          </div>
                          {order.status !== 'PENDING' && order.status !== 'SENT' && (
                            <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted/20">
                              <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between items-center border-t border-border mt-3 pt-3">
                    <span className="text-sm font-semibold text-muted-foreground">Total estimado</span>
                    <span className="text-base font-bold text-foreground">{formatPrice(orderTotal(order))}</span>
                  </div>
                </div>

                {/* Recepciones */}
                {receipts.length > 0 && (
                  <div className="border-b border-border px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">
                      Recepciones
                    </p>
                    <div className="space-y-2">
                      {receipts.map((receipt) => (
                        <div key={receipt.id} className="rounded-xl border border-border p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">Recepción #{receipt.receiptNumber}</span>
                            <span className="text-xs text-muted-foreground">{formatDatePY(receipt.receivedAt, 'local')}</span>
                          </div>
                          {receipt.warehouse && (
                            <p className="text-xs text-muted-foreground/60 mt-0.5">Depósito: {receipt.warehouse.name}</p>
                          )}
                          <ul className="mt-2 space-y-0.5">
                            {receipt.items.map((item) => (
                              <li key={item.id} className="text-xs text-muted-foreground flex justify-between">
                                <span className="truncate">{item.product.name}{item.batchNumber ? ` (lote ${item.batchNumber})` : ''}</span>
                                <span className="shrink-0 ml-2">{item.quantity} un.</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {order.notes && (
                  <div className="border-b border-border px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">Notas</p>
                    <p className="text-sm text-muted-foreground">{order.notes}</p>
                  </div>
                )}

                {order.statusChanges && order.statusChanges.length > 0 && (
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Historial</p>
                    <ol className="space-y-3">
                      {order.statusChanges.map((change) => (
                        <li key={change.id} className="relative pl-4 before:absolute before:left-0 before:top-1.5 before:h-1.5 before:w-1.5 before:rounded-full before:bg-primary">
                          <p className="text-sm font-medium text-foreground">{historyEntryLabel(change)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(change.createdAt).toLocaleString('es-PY', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                              timeZone: 'America/Asuncion',
                            })}
                            {change.changedBy && ` · ${change.changedBy.firstName} ${change.changedBy.lastName}`}
                          </p>
                          {change.reason && (
                            <p className="mt-0.5 text-xs text-muted-foreground">Motivo: {change.reason}</p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-5 py-4 space-y-2 border-t border-border shrink-0">
                {order.status !== 'CANCELLED' && (
                  <>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setDocumentNote(null); pdfMutation.mutate(); }}
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
                          onKeyDown={(e) => { if (e.key === 'Enter') sendEmail(); }}
                        />
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" className="flex-1" onClick={sendEmail} disabled={emailMutation.isPending}>
                            {emailMutation.isPending ? 'Enviando...' : 'Enviar'}
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => setEmailing(false)} disabled={emailMutation.isPending}>
                            Volver
                          </Button>
                        </div>
                      </div>
                    )}
                    {documentNote && (
                      <p
                        role={documentNote.ok ? 'status' : 'alert'}
                        className={cn('text-xs', documentNote.ok ? 'text-muted-foreground' : 'text-destructive')}
                      >
                        {documentNote.text}
                      </p>
                    )}
                  </>
                )}
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
                      <p className="text-xs text-muted-foreground mb-2">{ACTION_COPY[pendingAction].question}</p>
                      {pendingAction === 'cancel' && (
                        <textarea
                          className={cn(TEXTAREA_CLS, 'mb-2')}
                          rows={2}
                          autoFocus
                          aria-label="Motivo de la cancelación"
                          placeholder="Motivo de la cancelación..."
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                        />
                      )}
                      {actionError && (
                        <p role="alert" className="mb-2 text-xs text-destructive">{actionError}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          variant={pendingAction === 'cancel' ? 'destructive' : 'default'}
                          onClick={runAction}
                          disabled={statusMutation.isPending}
                        >
                          {statusMutation.isPending ? ACTION_COPY[pendingAction].busy : ACTION_COPY[pendingAction].yes}
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={closeAction} disabled={statusMutation.isPending}>
                          Volver
                        </Button>
                      </div>
                    </div>
                  )}
                </RequirePermission>
                <RequirePermission permission="procurement:receive">
                  {canReceive && (
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowReceive(true)}>
                      Registrar recepción de mercadería
                    </Button>
                  )}
                </RequirePermission>
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
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {order && showReceive && (
        <ReceiveModal
          order={order}
          open={showReceive}
          onOpenChange={setShowReceive}
          onSaved={() => {
            setShowReceive(false);
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProcurementPage() {
  const searchParams = useSearchParams();
  const poParam = searchParams.get('po');

  const [statusFilter, setStatusFilter] = useState<'' | PurchaseOrderStatus>('');
  const [showCreate, setShowCreate] = useState(false);
  const [panelOrder, setPanelOrder] = useState<PurchaseOrder | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dismissedPoParam, setDismissedPoParam] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: procurementApi.listOrders,
  });

  // Deep link desde el dropdown de Alertas ("Entrega de compra vencida",
  // ?po=<id>) — abre directo el detalle. Derivado en el render (sin efecto),
  // mismo patrón que ?ar= en payments/page.tsx.
  const deepLinkedOrder =
    poParam && poParam !== dismissedPoParam ? (orders.find((o) => o.id === poParam) ?? null) : null;
  const effectivePanelOrder = panelOrder ?? deepLinkedOrder;
  const effectivePanelOpen = panelOpen || !!deepLinkedOrder;

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: procurementApi.listSuppliers,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['inventory-products-active'],
    queryFn: () => inventoryApi.listProducts({ status: 'ACTIVE', isPurchasable: true }),
  });

  const filtered = statusFilter ? orders.filter((o) => o.status === statusFilter) : orders;

  function openPanel(order: PurchaseOrder) {
    setPanelOrder(order);
    setPanelOpen(true);
  }

  function closePanel(o: boolean) {
    setPanelOpen(o);
    if (!o && !panelOrder && poParam) setDismissedPoParam(poParam);
    // panelOrder stays for close animation
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Compras</h1>
          <p className="mt-1 text-sm text-muted-foreground">Órdenes de compra y proveedores</p>
        </div>
        <RequirePermission permission="procurement:create">
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Nueva orden
          </Button>
        </RequirePermission>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v as PurchaseOrderStatus)}>
          <SelectTrigger>
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {statusFilter ? STATUS_MAP[statusFilter as PurchaseOrderStatus].label : 'Todos los estados'}
            </span>
          </SelectTrigger>
          <SelectContent className="w-auto min-w-[10rem]">
            <SelectItem value="all">Todos los estados</SelectItem>
            {PURCHASE_ORDER_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {PURCHASE_ORDER_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Cargando órdenes...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">No se encontraron órdenes.</p>
          <RequirePermission permission="procurement:create">
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
            >
              Crear la primera
            </button>
          </RequirePermission>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Proveedor</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Entrega est.</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-center">Ítems</th>
                  <th className="px-4 py-3 text-right">Total est.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((order) => {
                  const deliveryOverdueDays = deliveryDaysOverdue(order);
                  const accent = deliveryAccentFor(order);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => openPanel(order)}
                      className="cursor-pointer hover:bg-muted/20 transition-colors"
                    >
                      <td
                        className={cn(
                          'px-4 py-3',
                          accent === 'destructive' && 'border-l-[3px] border-l-destructive',
                          accent === 'warn' && 'border-l-[3px] border-l-warn',
                        )}
                      >
                        <div className="font-medium text-foreground">{order.supplier.name}</div>
                        {order.orderNumber && (
                          <div className="font-mono text-xs text-muted-foreground">{order.orderNumber}</div>
                        )}
                        {order.supplier.email && <div className="text-xs text-muted-foreground/60">{order.supplier.email}</div>}
                      </td>
                      <td className="px-4 py-3"><TypeBadge type={order.purchaseType} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDatePY(order.orderDate, 'local')}</td>
                      <td
                        className={cn(
                          'px-4 py-3',
                          accent === 'destructive' && 'font-medium text-destructive',
                          accent === 'warn' && 'font-medium text-warn',
                          !accent && 'text-muted-foreground',
                        )}
                      >
                        {formatDatePY(order.expectedDate, 'utc')}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={order.status} deliveryOverdueDays={deliveryOverdueDays} /></td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{order.items.length}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-foreground tabular-nums">
                        {formatPrice(orderTotal(order))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CreateOrderModal
        open={showCreate}
        onOpenChange={setShowCreate}
        suppliers={suppliers}
        products={products}
        onSaved={() => setShowCreate(false)}
      />

      {/* key: al abrir otra orden, el panel arranca limpio (sin el motivo o
          el email a medio escribir de la anterior). */}
      <OrderDetailPanel
        key={effectivePanelOrder?.id ?? 'none'}
        order={effectivePanelOrder}
        open={effectivePanelOpen}
        onOpenChange={closePanel}
      />
    </div>
  );
}
