'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ShoppingCart, Users, X, Trash2 } from 'lucide-react';
import { salesApi, type Customer, type CreateSaleOrderItem, type SaleOrder, type SaleOrderStatus } from '../../../../lib/api/sales';
import { inventoryApi, type Product } from '../../../../lib/api/inventory';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function orderTotal(order: SaleOrder) {
  return order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
}

// ── Sub-nav ────────────────────────────────────────────────────────────────────

function SalesNav() {
  return (
    <div className="flex gap-1 border-b border-slate-200 mb-6">
      <Link
        href="/dashboard/sales"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-slate-900 text-slate-900 -mb-px"
      >
        <ShoppingCart size={15} />
        Pedidos
      </Link>
      <Link
        href="/dashboard/sales/customers"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 -mb-px"
      >
        <Users size={15} />
        Clientes
      </Link>
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<SaleOrderStatus, { label: string; className: string }> = {
  PENDING:     { label: 'Pendiente',   className: 'bg-slate-100 text-slate-600' },
  CONFIRMED: { label: 'Confirmado', className: 'bg-blue-50 text-blue-700' },
  INVOICED:  { label: 'Facturado',  className: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'Cancelado',  className: 'bg-red-50 text-red-600' },
};

function StatusBadge({ status }: { status: SaleOrderStatus }) {
  const { label, className } = STATUS_MAP[status];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// ── Line item row (inside create modal) ───────────────────────────────────────

interface LineItem {
  productId: string;
  product: Product | null;
  quantity: number;
  unitPrice: number;
  serialInput: string; // newline-separated
}

function LineItemRow({
  item,
  products,
  onChange,
  onRemove,
}: {
  item: LineItem;
  products: Product[];
  onChange: (updated: LineItem) => void;
  onRemove: () => void;
}) {
  const inputCls =
    'w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';

  function handleProductChange(productId: string) {
    const product = products.find((p) => p.id === productId) ?? null;
    onChange({
      ...item,
      productId,
      product,
      unitPrice: product ? Number(product.salePrice) : 0,
      serialInput: '',
    });
  }

  const subtotal = item.quantity * item.unitPrice;

  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2">
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <select
            className={inputCls}
            value={item.productId}
            onChange={(e) => handleProductChange(e.target.value)}
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
            onChange={(e) => onChange({ ...item, quantity: parseInt(e.target.value) || 1 })}
            required
          />
        </div>
        <div className="w-32">
          <input
            type="number"
            min={0}
            placeholder="Precio"
            className={inputCls}
            value={item.unitPrice || ''}
            onChange={(e) => onChange({ ...item, unitPrice: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>
        <div className="w-28 pt-1.5 text-right text-sm font-medium text-slate-700">
          {formatPrice(subtotal)}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="pt-1.5 text-slate-400 hover:text-red-500"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {item.product?.isSerialized && (
        <div>
          <label className="block text-xs text-slate-500 mb-1">
            Números de serie (uno por línea, {item.quantity} requerido{item.quantity !== 1 ? 's' : ''})
          </label>
          <textarea
            className={`${inputCls} resize-none font-mono text-xs`}
            rows={Math.min(item.quantity, 4)}
            placeholder={'SN001\nSN002'}
            value={item.serialInput}
            onChange={(e) => onChange({ ...item, serialInput: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// ── Create order modal ─────────────────────────────────────────────────────────

function CreateOrderModal({
  customers,
  products,
  onClose,
  onSaved,
}: {
  customers: Customer[];
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { productId: '', product: null, quantity: 1, unitPrice: 0, serialInput: '' },
  ]);
  const [error, setError] = useState('');

  function addItem() {
    setItems((prev) => [
      ...prev,
      { productId: '', product: null, quantity: 1, unitPrice: 0, serialInput: '' },
    ]);
  }

  function updateItem(index: number, updated: LineItem) {
    setItems((prev) => prev.map((it, i) => (i === index ? updated : it)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  const mutation = useMutation({
    mutationFn: () => {
      const dto: Parameters<typeof salesApi.createOrder>[0] = {
        customerId,
        notes: notes.trim() || undefined,
        items: items.map((it): CreateSaleOrderItem => ({
          productId: it.productId,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          serialNumbers: it.product?.isSerialized
            ? it.serialInput.split('\n').map((s) => s.trim()).filter(Boolean)
            : undefined,
        })),
      };
      return salesApi.createOrder(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sale-orders'] });
      onSaved();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al crear el pedido'));
    },
  });

  const labelCls = 'block text-xs font-medium text-slate-600 mb-1';
  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Nuevo pedido</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            if (items.length === 0) {
              setError('Agregá al menos un producto');
              return;
            }
            mutation.mutate();
          }}
          className="px-6 py-5 space-y-5"
        >
          {/* Cliente */}
          <div>
            <label className={labelCls}>Cliente *</label>
            <select
              className={inputCls}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              <option value="">— Seleccionar cliente —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                  {c.taxId ? ` · RUC ${c.taxId}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Productos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Productos
              </p>
              <div className="text-xs text-slate-500 hidden sm:flex gap-2 mr-8 pr-4">
                <span className="w-20 text-right">Cant.</span>
                <span className="w-32 text-right">P. Unitario</span>
                <span className="w-28 text-right">Subtotal</span>
              </div>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <LineItemRow
                  key={idx}
                  item={item}
                  products={products}
                  onChange={(updated) => updateItem(idx, updated)}
                  onRemove={() => removeItem(idx)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addItem}
              className="mt-2 flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
            >
              <Plus size={14} />
              Agregar producto
            </button>
          </div>

          {/* Total */}
          {items.length > 0 && (
            <div className="flex justify-end border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-500 mr-3">Total estimado</span>
              <span className="text-sm font-bold text-slate-900">{formatPrice(total)}</span>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className={labelCls}>Notas (opcional)</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder="Instrucciones de entrega, observaciones..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Creando...' : 'Crear pedido'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Order detail panel ─────────────────────────────────────────────────────────

function OrderDetailPanel({
  order,
  onClose,
}: {
  order: SaleOrder;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<'confirm' | 'cancel' | null>(null);

  const confirmMutation = useMutation({
    mutationFn: () => salesApi.confirmOrder(order.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sale-orders'] });
      setConfirmAction(null);
      onClose();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => salesApi.cancelOrder(order.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sale-orders'] });
      setConfirmAction(null);
      onClose();
    },
  });

  const total = orderTotal(order);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-900">
                {order.customer.firstName} {order.customer.lastName}
              </p>
              <StatusBadge status={order.status} />
            </div>
            {order.customer.email && (
              <p className="text-xs text-slate-400 mt-0.5">{order.customer.email}</p>
            )}
            <p className="text-xs text-slate-400 mt-0.5">{formatDate(order.orderDate)}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Items */}
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Productos
          </p>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 truncate">{item.product.name}</p>
                  {item.product.model && (
                    <p className="text-xs text-slate-400">{item.product.model}</p>
                  )}
                  {item.productUnits.length > 0 && (
                    <p className="text-xs text-slate-400 font-mono">
                      S/N: {item.productUnits.map((u) => u.serialNumber).join(', ')}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-slate-500">{item.quantity} × {formatPrice(item.unitPrice)}</p>
                  <p className="text-sm font-medium text-slate-800">{formatPrice(item.quantity * item.unitPrice)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center border-t border-slate-100 mt-3 pt-3">
            <span className="text-sm font-semibold text-slate-700">Total</span>
            <span className="text-base font-bold text-slate-900">{formatPrice(total)}</span>
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Notas</p>
            <p className="text-sm text-slate-600">{order.notes}</p>
          </div>
        )}

        {/* Invoice info */}
        {order.invoice && (
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Factura</p>
            <p className="text-sm text-slate-600">Estado: {order.invoice.status}</p>
          </div>
        )}

        {/* Actions */}
        {order.status === 'PENDING' && (
          <div className="px-5 py-4 space-y-2">
            {confirmAction === null && (
              <>
                <button
                  onClick={() => setConfirmAction('confirm')}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Confirmar pedido
                </button>
                <button
                  onClick={() => setConfirmAction('cancel')}
                  className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Cancelar pedido
                </button>
              </>
            )}

            {confirmAction === 'confirm' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-700 mb-2">
                  ¿Confirmar el pedido? Esto descontará el stock.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmMutation.mutate()}
                    disabled={confirmMutation.isPending}
                    className="flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {confirmMutation.isPending ? 'Confirmando...' : 'Sí, confirmar'}
                  </button>
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Volver
                  </button>
                </div>
                {confirmMutation.isError && (
                  <p className="mt-2 text-xs text-red-600">
                    {(confirmMutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al confirmar'}
                  </p>
                )}
              </div>
            )}

            {confirmAction === 'cancel' && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs text-red-700 mb-2">¿Cancelar este pedido?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancelMutation.isPending ? 'Cancelando...' : 'Sí, cancelar'}
                  </button>
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Volver
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | SaleOrderStatus>('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SaleOrder | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['sale-orders'],
    queryFn: salesApi.listOrders,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['sale-customers'],
    queryFn: salesApi.listCustomers,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['inventory-products-active'],
    queryFn: () => inventoryApi.listProducts({ isActive: true }),
  });

  const filtered = orders.filter((o) => {
    const name = `${o.customer.firstName} ${o.customer.lastName}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchStatus = !statusFilter || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const selectCls =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 bg-white';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Ventas</h1>
          <p className="mt-1 text-sm text-slate-500">Pedidos y clientes</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          <Plus size={16} />
          Nuevo pedido
        </button>
      </div>

      <SalesNav />

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            placeholder="Buscar por cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={selectCls}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | SaleOrderStatus)}
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Borrador</option>
          <option value="CONFIRMED">Confirmado</option>
          <option value="INVOICED">Facturado</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-slate-400">Cargando pedidos...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-slate-400">No se encontraron pedidos.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm font-medium text-slate-900 underline underline-offset-2"
          >
            Crear el primero
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-center">Productos</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {order.customer.firstName} {order.customer.lastName}
                    </div>
                    {order.customer.email && (
                      <div className="text-xs text-slate-400">{order.customer.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(order.orderDate)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">{order.items.length}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-slate-800">
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
          customers={customers}
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
