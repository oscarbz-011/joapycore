'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Truck, Users, X, Trash2 } from 'lucide-react';
import {
  procurementApi,
  type CreatePurchaseOrderItem,
  type PurchaseOrder,
  type PurchaseOrderStatus,
  type PurchaseType,
  type ReceiveItem,
  type Supplier,
} from '../../../../lib/api/procurement';
import { inventoryApi, type Product } from '../../../../lib/api/inventory';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function orderTotal(order: PurchaseOrder) {
  return order.items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unitCost), 0);
}

// ── Sub-nav ────────────────────────────────────────────────────────────────────

function ProcurementNav() {
  return (
    <div className="flex gap-1 border-b border-border mb-6">
      <Link
        href="/dashboard/procurement"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-ink text-ink -mb-px"
      >
        <Truck size={15} />
        Órdenes de compra
      </Link>
      <Link
        href="/dashboard/procurement/suppliers"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-muted hover:text-ink -mb-px"
      >
        <Users size={15} />
        Proveedores
      </Link>
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<PurchaseOrderStatus, { label: string; className: string }> = {
  PENDING:              { label: 'Borrador',            className: 'bg-surface-2 text-muted' },
  CONFIRMED:          { label: 'Confirmada',           className: 'bg-blue-50 text-blue-700' },
  PARTIALLY_RECEIVED: { label: 'Recepción parcial',   className: 'bg-amber-50 text-amber-700' },
  RECEIVED:           { label: 'Recibida',             className: 'bg-emerald-50 text-emerald-700' },
  CANCELLED:          { label: 'Cancelada',            className: 'bg-red-50 text-red-600' },
};

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const { label, className } = STATUS_MAP[status];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function TypeBadge({ type }: { type: PurchaseType }) {
  return type === 'IMPORT' ? (
    <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
      Importación
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
      Local
    </span>
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
  suppliers,
  products,
  onClose,
  onSaved,
}: {
  suppliers: Supplier[];
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [purchaseType, setPurchaseType] = useState<PurchaseType>('LOCAL');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [customsDuty, setCustomsDuty] = useState('');
  const [customsRef, setCustomsRef] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { productId: '', product: null, quantity: 1, unitCost: 0 },
  ]);
  const [error, setError] = useState('');

  const isImport = purchaseType === 'IMPORT';

  function handleProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId) ?? null;
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? { ...it, productId, product, unitCost: product ? Number(product.costPrice) : 0 }
          : it,
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

  const inputCls =
    'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong';
  const labelCls = 'block text-xs font-medium text-muted mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Nueva orden de compra</h2>
          <button onClick={onClose} className="rounded-md p-1 text-faint hover:bg-surface-2">
            <X size={18} />
          </button>
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
            <div>
              <label className={labelCls}>Proveedor *</label>
              <select
                className={inputCls}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                required
              >
                <option value="">— Seleccionar —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tipo de compra *</label>
              <select
                className={inputCls}
                value={purchaseType}
                onChange={(e) => setPurchaseType(e.target.value as PurchaseType)}
              >
                <option value="LOCAL">Local</option>
                <option value="IMPORT">Importación</option>
              </select>
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Fecha de orden *</label>
              <input
                type="date"
                className={inputCls}
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Fecha esperada de entrega</label>
              <input
                type="date"
                className={inputCls}
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
          </div>

          {/* Campos de importación */}
          {isImport && (
            <div className="rounded-lg bg-violet-50 border border-violet-100 px-4 py-3 space-y-3">
              <p className="text-xs font-semibold text-violet-700 uppercase tracking-wider">
                Datos de importación
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`${labelCls} text-violet-700`}>Tipo de cambio</label>
                  <input
                    type="number"
                    min={0}
                    step="0.0001"
                    className={inputCls}
                    placeholder="7350.0000"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                  />
                </div>
                <div>
                  <label className={`${labelCls} text-violet-700`}>Arancel aduanero (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    className={inputCls}
                    placeholder="10.00"
                    value={customsDuty}
                    onChange={(e) => setCustomsDuty(e.target.value)}
                  />
                </div>
                <div>
                  <label className={`${labelCls} text-violet-700`}>Ref. aduanera</label>
                  <input
                    className={inputCls}
                    placeholder="DUA-2026-001"
                    value={customsRef}
                    onChange={(e) => setCustomsRef(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Productos */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-2">
              Productos
            </p>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3">
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <select
                        className={inputCls}
                        value={item.productId}
                        onChange={(e) => handleProductChange(idx, e.target.value)}
                        required
                      >
                        <option value="">— Seleccionar producto —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.model ? ` (${p.model})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-20">
                      <input
                        type="number"
                        min={1}
                        placeholder="Cant."
                        className={inputCls}
                        value={item.quantity || ''}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? { ...it, quantity: parseInt(e.target.value) || 1 } : it,
                            ),
                          )
                        }
                        required
                      />
                    </div>
                    <div className="w-32">
                      <input
                        type="number"
                        min={0}
                        placeholder="Costo unit."
                        className={inputCls}
                        value={item.unitCost || ''}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? { ...it, unitCost: parseFloat(e.target.value) || 0 } : it,
                            ),
                          )
                        }
                        required
                      />
                    </div>
                    <div className="w-28 text-right text-sm font-medium text-muted">
                      {formatPrice(Number(item.quantity) * Number(item.unitCost))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-faint hover:text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setItems((prev) => [...prev, { productId: '', product: null, quantity: 1, unitCost: 0 }])
              }
              className="mt-2 flex items-center gap-1.5 text-sm text-muted hover:text-ink"
            >
              <Plus size={14} />
              Agregar producto
            </button>
          </div>

          {items.length > 0 && (
            <div className="flex justify-end border-t border-border pt-3">
              <span className="text-sm text-muted mr-3">Total estimado</span>
              <span className="text-sm font-bold text-ink">{formatPrice(total)}</span>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className={labelCls}>Notas (opcional)</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder="Condiciones de pago, instrucciones..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm text-muted hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50"
            >
              {mutation.isPending ? 'Creando...' : 'Crear orden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Receive modal ──────────────────────────────────────────────────────────────

function ReceiveModal({
  order,
  onClose,
  onSaved,
}: {
  order: PurchaseOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const pendingItems = order.items.filter((i) => i.receivedQty < i.quantity);
  const [serialInputs, setSerialInputs] = useState<Record<string, string>>(
    Object.fromEntries(pendingItems.map((i) => [i.id, ''])),
  );
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const items: ReceiveItem[] = pendingItems.map((item) => ({
        itemId: item.id,
        serialNumbers: item.product.isSerialized
          ? serialInputs[item.id].split('\n').map((s) => s.trim()).filter(Boolean)
          : undefined,
      }));
      return procurementApi.receiveItems(order.id, { items });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      onSaved();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al registrar recepción'));
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Registrar recepción</h2>
          <button onClick={onClose} className="rounded-md p-1 text-faint hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted">
            Ítems pendientes de recepción para la orden de <strong>{order.supplier.name}</strong>:
          </p>

          {pendingItems.map((item) => {
            const pending = item.quantity - item.receivedQty;
            return (
              <div key={item.id} className="rounded-lg border border-border p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-medium text-ink">{item.product.name}</p>
                    {item.product.model && (
                      <p className="text-xs text-faint">{item.product.model}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted">
                    Pendiente: <strong>{pending}</strong> {item.product.unit}
                  </span>
                </div>
                {item.product.isSerialized ? (
                  <div>
                    <label className="block text-xs text-muted mb-1">
                      Números de serie (uno por línea — {pending} requerido{pending !== 1 ? 's' : ''})
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-mono text-ink focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong resize-none"
                      rows={Math.min(pending, 5)}
                      placeholder={'SN001\nSN002'}
                      value={serialInputs[item.id] ?? ''}
                      onChange={(e) =>
                        setSerialInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                    />
                  </div>
                ) : (
                  <p className="text-xs text-faint">
                    Se registrará la recepción de {pending} unidad{pending !== 1 ? 'es' : ''} al confirmar.
                  </p>
                )}
              </div>
            );
          })}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm text-muted hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              onClick={() => { setError(''); mutation.mutate(); }}
              disabled={mutation.isPending}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50"
            >
              {mutation.isPending ? 'Registrando...' : 'Confirmar recepción'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Order detail panel ─────────────────────────────────────────────────────────

function OrderDetailPanel({
  order,
  onClose,
}: {
  order: PurchaseOrder;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [showReceive, setShowReceive] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'confirm' | null>(null);

  const confirmMutation = useMutation({
    mutationFn: () => procurementApi.confirmOrder(order.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setConfirmAction(null);
      onClose();
    },
  });

  const canConfirm = order.status === 'PENDING';
  const canReceive = order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED';

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <aside className="relative z-50 flex h-full w-full max-w-sm flex-col bg-surface shadow-2xl overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border px-5 py-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-ink">{order.supplier.name}</p>
                <StatusBadge status={order.status} />
                <TypeBadge type={order.purchaseType} />
              </div>
              <p className="text-xs text-faint mt-0.5">
                Orden: {formatDate(order.orderDate)}
                {order.expectedDate ? ` · Entrega est.: ${formatDate(order.expectedDate)}` : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-3 shrink-0 rounded-md p-1 text-faint hover:bg-surface-2"
            >
              <X size={18} />
            </button>
          </div>

          {/* Import fields */}
          {order.purchaseType === 'IMPORT' && (order.exchangeRate || order.customsDuty || order.customsRef) && (
            <div className="border-b border-border px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-2">Importación</p>
              <div className="space-y-1 text-sm">
                {order.exchangeRate && (
                  <div className="flex justify-between">
                    <span className="text-muted">Tipo de cambio</span>
                    <span className="text-muted">{Number(order.exchangeRate).toFixed(4)}</span>
                  </div>
                )}
                {order.customsDuty && (
                  <div className="flex justify-between">
                    <span className="text-muted">Arancel</span>
                    <span className="text-muted">{Number(order.customsDuty)}%</span>
                  </div>
                )}
                {order.customsRef && (
                  <div className="flex justify-between">
                    <span className="text-muted">Ref. aduanera</span>
                    <span className="text-muted font-mono text-xs">{order.customsRef}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Items */}
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">Productos</p>
            <div className="space-y-3">
              {order.items.map((item) => {
                const received = item.receivedQty;
                const total = item.quantity;
                const pct = total > 0 ? (received / total) * 100 : 0;
                return (
                  <div key={item.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink truncate">{item.product.name}</p>
                        {item.product.model && (
                          <p className="text-xs text-faint">{item.product.model}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm text-muted">{total} × {formatPrice(Number(item.unitCost))}</p>
                        <p className="text-xs text-faint">Recibido: {received}/{total}</p>
                      </div>
                    </div>
                    {order.status !== 'PENDING' && (
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-2">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between items-center border-t border-border mt-3 pt-3">
              <span className="text-sm font-semibold text-muted">Total estimado</span>
              <span className="text-base font-bold text-ink">{formatPrice(orderTotal(order))}</span>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="border-b border-border px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-1">Notas</p>
              <p className="text-sm text-muted">{order.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="px-5 py-4 space-y-2">
            {canConfirm && confirmAction === null && (
              <button
                onClick={() => setConfirmAction('confirm')}
                className="w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80"
              >
                Confirmar orden
              </button>
            )}
            {canConfirm && confirmAction === 'confirm' && (
              <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
                <p className="text-xs text-muted mb-2">¿Confirmar esta orden de compra?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmMutation.mutate()}
                    disabled={confirmMutation.isPending}
                    className="flex-1 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-canvas hover:opacity-80 disabled:opacity-50"
                  >
                    {confirmMutation.isPending ? 'Confirmando...' : 'Sí, confirmar'}
                  </button>
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-muted"
                  >
                    Volver
                  </button>
                </div>
              </div>
            )}
            {canReceive && (
              <button
                onClick={() => setShowReceive(true)}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Registrar recepción de mercadería
              </button>
            )}
          </div>
        </aside>
      </div>

      {showReceive && (
        <ReceiveModal
          order={order}
          onClose={() => setShowReceive(false)}
          onSaved={() => {
            setShowReceive(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProcurementPage() {
  const [statusFilter, setStatusFilter] = useState<'' | PurchaseOrderStatus>('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);

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
    queryFn: () => inventoryApi.listProducts({ isActive: true }),
  });

  const filtered = statusFilter ? orders.filter((o) => o.status === statusFilter) : orders;

  const selectCls =
    'rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Compras</h1>
          <p className="mt-1 text-sm text-muted">Órdenes de compra y proveedores</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80"
        >
          <Plus size={16} />
          Nueva orden
        </button>
      </div>

      <ProcurementNav />

      {/* Filter */}
      <div className="mb-4 flex items-center gap-3">
        <select
          className={selectCls}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | PurchaseOrderStatus)}
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Borrador</option>
          <option value="CONFIRMED">Confirmada</option>
          <option value="PARTIALLY_RECEIVED">Recepción parcial</option>
          <option value="RECEIVED">Recibida</option>
          <option value="CANCELLED">Cancelada</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-faint">Cargando órdenes...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-faint">No se encontraron órdenes.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm font-medium text-ink underline underline-offset-2"
          >
            Crear la primera
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Proveedor</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-center">Ítems</th>
                <th className="px-4 py-3 text-right">Total est.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="cursor-pointer hover:bg-surface-2 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{order.supplier.name}</div>
                    {order.supplier.email && (
                      <div className="text-xs text-faint">{order.supplier.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={order.purchaseType} />
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(order.orderDate)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-center text-muted">{order.items.length}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-ink">
                    {formatPrice(orderTotal(order))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateOrderModal
          suppliers={suppliers}
          products={products}
          onClose={() => setShowCreate(false)}
          onSaved={() => setShowCreate(false)}
        />
      )}

      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
}
