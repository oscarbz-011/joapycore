'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2, AlertTriangle } from 'lucide-react';
import {
  procurementApi,
  type CreatePurchaseOrderItem,
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
  PENDING:              { label: 'Borrador',          className: 'bg-muted/30 text-muted-foreground border-border' },
  CONFIRMED:            { label: 'Confirmada',         className: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800' },
  PARTIALLY_RECEIVED:   { label: 'Recepción parcial',  className: 'bg-warn-subtle text-warn border-warn/30' },
  RECEIVED:             { label: 'Recibida',           className: 'bg-accent-subtle text-accent-on border-accent-on/20' },
  CANCELLED:            { label: 'Cancelada',          destructive: true },
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

interface LineItem {
  productId: string;
  product: Product | null;
  quantity: number;
  unitCost: number;
}

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
  const [items, setItems] = useState<LineItem[]>([{ productId: '', product: null, quantity: 1, unitCost: 0 }]);
  const [error, setError] = useState('');

  const isImport = purchaseType === 'IMPORT';

  function handleProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId) ?? null;
    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, productId, product, unitCost: product ? Number(product.costPrice) : 0 } : it,
      ),
    );
  }

  const total = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unitCost), 0);

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
        items: items.map((it): CreatePurchaseOrderItem => ({
          productId: it.productId,
          quantity: Number(it.quantity),
          unitCost: Number(it.unitCost),
        })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      onSaved();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al crear la orden'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl p-0 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-card z-10">
          <DialogTitle>Nueva orden de compra</DialogTitle>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            if (items.length === 0) { setError('Agregá al menos un producto'); return; }
            mutation.mutate();
          }}
          className="px-6 py-5 space-y-5"
        >
          {/* Proveedor + tipo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Proveedor *</Label>
              <Select value={supplierId || 'none'} onValueChange={(v) => setSupplierId(v && v !== 'none' ? v : '')}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">{suppliers.find((s) => s.id === supplierId)?.name ?? '— Seleccionar —'}</span>
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
                Comparar precios por proveedor
              </Link>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-border p-3">
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <Select value={item.productId || 'none'} onValueChange={(v) => handleProductChange(idx, v && v !== 'none' ? v : '')}>
                        <SelectTrigger className="w-full">
                          <span className="flex-1 text-left text-sm truncate">{products.find((p) => p.id === item.productId)?.name ?? '— Seleccionar producto —'}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Seleccionar producto —</SelectItem>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}{p.model ? ` (${p.model})` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-20">
                      <input
                        type="number" min={1} placeholder="Cant." className={NUM_CLS}
                        value={item.quantity || ''}
                        onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, quantity: parseInt(e.target.value) || 1 } : it))}
                        required
                      />
                    </div>
                    <div className="w-32">
                      <input
                        type="number" min={0} placeholder="Costo unit." className={NUM_CLS}
                        value={item.unitCost || ''}
                        onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, unitCost: parseFloat(e.target.value) || 0 } : it))}
                        required
                      />
                    </div>
                    <div className="w-28 text-right text-sm font-medium text-muted-foreground tabular-nums">
                      {formatPrice(Number(item.quantity) * Number(item.unitCost))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-muted-foreground/60 hover:text-destructive"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, { productId: '', product: null, quantity: 1, unitCost: 0 }])}
              className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Plus size={14} />
              Agregar producto
            </button>
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
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al registrar recepción'));
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

function OrderDetailPanel({
  order,
  open,
  onOpenChange,
}: {
  order: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [showReceive, setShowReceive] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'confirm' | null>(null);

  const { data: receipts = [] } = useQuery({
    queryKey: ['purchase-receipts', order?.id],
    queryFn: () => procurementApi.listReceipts(order!.id),
    enabled: !!order && order.status !== 'PENDING',
  });

  const confirmMutation = useMutation({
    mutationFn: () => procurementApi.confirmOrder(order!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setConfirmAction(null);
      onOpenChange(false);
    },
  });

  const canConfirm = order?.status === 'PENDING';
  const canReceive = order?.status === 'CONFIRMED' || order?.status === 'PARTIALLY_RECEIVED';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full max-w-sm flex-col p-0 sm:max-w-sm" showCloseButton>
          {order && (
            <>
              <SheetHeader className="border-b border-border px-5 py-4 shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <SheetTitle>{order.supplier.name}</SheetTitle>
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
                              {item.product.model && <p className="text-xs text-muted-foreground/60">{item.product.model}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm text-muted-foreground">{total} × {formatPrice(Number(item.unitCost))}</p>
                              <p className="text-xs text-muted-foreground/60">Recibido: {received}/{total}</p>
                            </div>
                          </div>
                          {order.status !== 'PENDING' && (
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
              </div>

              {/* Actions */}
              <div className="px-5 py-4 space-y-2 border-t border-border shrink-0">
                {canConfirm && confirmAction === null && (
                  <Button className="w-full" onClick={() => setConfirmAction('confirm')}>
                    Confirmar orden
                  </Button>
                )}
                {canConfirm && confirmAction === 'confirm' && (
                  <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                    <p className="text-xs text-muted-foreground mb-2">¿Confirmar esta orden de compra?</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => confirmMutation.mutate()}
                        disabled={confirmMutation.isPending}
                      >
                        {confirmMutation.isPending ? 'Confirmando...' : 'Sí, confirmar'}
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirmAction(null)}>
                        Volver
                      </Button>
                    </div>
                  </div>
                )}
                {canReceive && (
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowReceive(true)}>
                    Registrar recepción de mercadería
                  </Button>
                )}
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
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          Nueva orden
        </Button>
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
            <SelectItem value="PENDING">Borrador</SelectItem>
            <SelectItem value="CONFIRMED">Confirmada</SelectItem>
            <SelectItem value="PARTIALLY_RECEIVED">Recepción parcial</SelectItem>
            <SelectItem value="RECEIVED">Recibida</SelectItem>
            <SelectItem value="CANCELLED">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Cargando órdenes...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">No se encontraron órdenes.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
          >
            Crear la primera
          </button>
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

      <OrderDetailPanel
        order={effectivePanelOrder}
        open={effectivePanelOpen}
        onOpenChange={closePanel}
      />
    </div>
  );
}
