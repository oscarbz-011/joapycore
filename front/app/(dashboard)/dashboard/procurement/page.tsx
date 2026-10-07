'use client';

import { RequirePermission } from '@/components/require-permission';

import { apiErrorMessage } from '@/lib/api/api-error';
import {
  advanceDraftError,
  resolveAdvanceDraft,
  supplierAdvanceDraft,
  type AdvanceDraft,
} from '@/lib/advance';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, X, Trash2, AlertTriangle } from 'lucide-react';
import { CatalogItemPicker } from '@/components/procurement/catalog-item-picker';
import {
  NUM_CLS,
  StatusBadge,
  TEXTAREA_CLS,
  TypeBadge,
  deliveryAccentFor,
  deliveryDaysOverdue,
  formatPrice,
  orderTotal,
} from '@/components/procurement/purchase-order-shared';
import { SortableHeader } from '@/components/sortable-header';
import type { SortValue } from '@/lib/table-sort';
import { useTableSort } from '@/lib/use-table-sort';
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_STATUS_LABEL,
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
  type Supplier,
} from '../../../../lib/api/procurement';
import { inventoryApi, type Product } from '../../../../lib/api/inventory';
import { formatDatePY, todayISODate } from '../../../../lib/date';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// Una columna por dato; fuera del componente para no reordenar en cada render.
type OrderSortKey =
  | 'number' | 'supplier' | 'email' | 'type' | 'date' | 'expected' | 'status' | 'items' | 'total';

const ORDER_SORT: Record<OrderSortKey, (order: PurchaseOrder) => SortValue> = {
  number: (order) => order.orderNumber,
  supplier: (order) => order.supplier.name,
  email: (order) => order.supplier.email,
  type: (order) => order.purchaseType,
  date: (order) => new Date(order.orderDate),
  expected: (order) => (order.expectedDate ? new Date(order.expectedDate) : null),
  status: (order) => PURCHASE_ORDER_STATUS_LABEL[order.status],
  items: (order) => order.items.length,
  total: (order) => orderTotal(order),
};

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
  const [advanceDraft, setAdvanceDraft] = useState<AdvanceDraft>(supplierAdvanceDraft(null));
  const [items, setItems] = useState<OrderLine[]>([]);
  const [pickingCatalog, setPickingCatalog] = useState(false);
  const [error, setError] = useState('');
  const supplier = suppliers.find((s) => s.id === supplierId);

  // Las líneas tomadas del catálogo son del proveedor elegido.
  function changeSupplier(id: string) {
    setSupplierId(id);
    // El anticipo arranca en lo que pide habitualmente ese proveedor.
    setAdvanceDraft(
      supplierAdvanceDraft(suppliers.find((s) => s.id === id)?.advancePercent ?? null),
    );
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
  const advance = resolveAdvanceDraft(advanceDraft, total);

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
        advanceAmount: advance.amount,
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
            const problem = !supplierId
              ? 'Elegí el proveedor'
              : (orderLinesError(items) ?? advanceDraftError(advanceDraft, total));
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

          {/* Anticipo: se carga como porcentaje o como monto, el otro se calcula */}
          <fieldset className="rounded-xl border border-border px-4 py-3">
            <legend className="px-1 text-sm font-medium text-foreground">
              Anticipo para despachar
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="order-advance-percent">Porcentaje de la orden (%)</Label>
                <Input
                  id="order-advance-percent"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  placeholder="Sin anticipo"
                  value={
                    advanceDraft.mode === 'percent'
                      ? advanceDraft.value
                      : advance.percent
                        ? String(advance.percent)
                        : ''
                  }
                  onChange={(e) => setAdvanceDraft({ mode: 'percent', value: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="order-advance-amount">Monto (Gs.)</Label>
                <Input
                  id="order-advance-amount"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Sin anticipo"
                  value={
                    advanceDraft.mode === 'amount'
                      ? advanceDraft.value
                      : advance.amount
                        ? String(advance.amount)
                        : ''
                  }
                  onChange={(e) => setAdvanceDraft({ mode: 'amount', value: e.target.value })}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {advance.amount > 0
                ? `El proveedor cobra ${formatPrice(advance.amount)} antes de enviar la mercadería. El pago se registra desde la orden y se descuenta de la cuenta por pagar al recibir.`
                : 'Sin anticipo: la orden se paga después de recibir la mercadería. Si el proveedor pide cobrar todo antes de enviar, cargá 100%.'}
            </p>
          </fieldset>

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

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProcurementPage() {
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<'' | PurchaseOrderStatus>('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: procurementApi.listOrders,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: procurementApi.listSuppliers,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['inventory-products-active'],
    queryFn: () => inventoryApi.listProducts({ status: 'ACTIVE', isPurchasable: true }),
  });

  const filtered = statusFilter ? orders.filter((o) => o.status === statusFilter) : orders;
  const { sorted, sort, toggle } = useTableSort(filtered, ORDER_SORT);

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
              {statusFilter ? PURCHASE_ORDER_STATUS_LABEL[statusFilter] : 'Todos los estados'}
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
                  <SortableHeader label="N° de orden" sortKey="number" sort={sort} onSort={toggle} className="whitespace-nowrap" />
                  <SortableHeader label="Proveedor" sortKey="supplier" sort={sort} onSort={toggle} />
                  <SortableHeader label="Email" sortKey="email" sort={sort} onSort={toggle} />
                  <SortableHeader label="Tipo" sortKey="type" sort={sort} onSort={toggle} />
                  <SortableHeader label="Fecha" sortKey="date" sort={sort} onSort={toggle} />
                  <SortableHeader label="Entrega est." sortKey="expected" sort={sort} onSort={toggle} className="whitespace-nowrap" />
                  <SortableHeader label="Estado" sortKey="status" sort={sort} onSort={toggle} />
                  <SortableHeader label="Ítems" sortKey="items" sort={sort} onSort={toggle} align="center" />
                  <SortableHeader label="Total est." sortKey="total" sort={sort} onSort={toggle} align="right" className="whitespace-nowrap" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((order) => {
                  const deliveryOverdueDays = deliveryDaysOverdue(order);
                  const accent = deliveryAccentFor(order);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => router.push(`/dashboard/procurement/orders/${order.id}`)}
                      className="cursor-pointer hover:bg-muted/20 transition-colors"
                    >
                      <td
                        className={cn(
                          'px-4 py-3 font-mono text-[13px] whitespace-nowrap text-muted-foreground',
                          accent === 'destructive' && 'border-l-[3px] border-l-destructive',
                          accent === 'warn' && 'border-l-[3px] border-l-warn',
                        )}
                      >
                        {order.orderNumber ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{order.supplier.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{order.supplier.email ?? '—'}</td>
                      <td className="px-4 py-3"><TypeBadge type={order.purchaseType} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDatePY(order.orderDate, 'utc')}</td>
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

    </div>
  );
}
