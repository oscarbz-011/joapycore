'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X, Trash2, UserCheck } from 'lucide-react';
import { NumericInput } from '../../../../components/numeric-input';
import {
  salesApi,
  type Customer,
  type CreateSaleOrderItem,
  type OrderType,
  type SaleOrder,
  type SaleOrderStatus,
  type SaleType,
} from '../../../../lib/api/sales';
import { inventoryApi, type Product } from '../../../../lib/api/inventory';
import { settingsApi, type CreditPlan } from '../../../../lib/api/settings';
import { usersApi } from '../../../../lib/api/users';
import { useAuth } from '../../../../lib/auth-context';
import { SearchSelect } from '../components/search-select';

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

function orderSubtotal(order: SaleOrder) {
  return order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
}

function orderSurchargeAmount(order: SaleOrder, subtotal: number): number {
  if (!order.surchargeType || !order.surchargeAmount) return 0;
  return order.surchargeType === 'PERCENTAGE'
    ? subtotal * (order.surchargeAmount / 100)
    : order.surchargeAmount;
}

function orderTotal(order: SaleOrder) {
  const sub = orderSubtotal(order);
  return sub + orderSurchargeAmount(order, sub);
}

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<SaleOrderStatus, { label: string; className: string }> = {
  QUOTED:                  { label: 'Presupuesto',       className: 'bg-violet-50 text-violet-700' },
  PENDING:                 { label: 'Pendiente',         className: 'bg-surface-2 text-muted' },
  PENDING_CREDIT_APPROVAL: { label: 'En evaluación',     className: 'bg-amber-50 text-amber-700' },
  CREDIT_APPROVED:         { label: 'Crédito aprobado',  className: 'bg-sky-50 text-sky-700' },
  CREDIT_REJECTED:         { label: 'Crédito rechazado', className: 'bg-red-50 text-red-700' },
  CONFIRMED:               { label: 'Confirmado',        className: 'bg-blue-50 text-blue-700' },
  DELIVERED:               { label: 'Entregado',         className: 'bg-teal-50 text-teal-700' },
  INVOICED:                { label: 'Facturado',         className: 'bg-emerald-50 text-emerald-700' },
  CANCELLED:               { label: 'Cancelado',         className: 'bg-red-50 text-red-600' },
};

function StatusBadge({ status }: { status: SaleOrderStatus }) {
  const { label, className } = STATUS_MAP[status] ?? STATUS_MAP.PENDING;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// ── Line item row ──────────────────────────────────────────────────────────────

interface LineItem {
  productId: string;
  product: Product | null;
  quantity: number;
  unitPrice: number;
  serialInput: string;
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
    'w-full rounded-lg border border-border-strong bg-surface text-ink px-2.5 py-1.5 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong';

  const subtotal = item.quantity * item.unitPrice;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <SearchSelect<Product>
            items={products}
            value={item.productId}
            onChange={(id, product) =>
              onChange({
                ...item,
                productId: id,
                product,
                unitPrice: product ? Number(product.salePrice) : 0,
                serialInput: '',
              })
            }
            getKey={(p) => p.id}
            getLabel={(p) => `${p.name}${p.model ? ` (${p.model})` : ''}`}
            getDescription={(p) => p.category?.name ?? null}
            filterFn={(p, q) =>
              `${p.name} ${p.model ?? ''} ${p.category?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())
            }
            placeholder="Buscar producto..."
            required
          />
        </div>
        <div className="w-20">
          <NumericInput
            value={item.quantity}
            onChange={(v) => onChange({ ...item, quantity: Math.max(1, Math.round(v)) })}
            placeholder="Cant."
            className={inputCls}
            required
          />
        </div>
        <div className="w-32">
          <NumericInput
            value={item.unitPrice}
            onChange={(v) => onChange({ ...item, unitPrice: v })}
            placeholder="Precio"
            className={inputCls}
            required
          />
        </div>
        <div className="w-28 pt-1.5 text-right text-sm font-medium text-muted">
          {formatPrice(subtotal)}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="pt-1.5 text-faint hover:text-red-500"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {item.product?.isSerialized && (
        <div>
          <label className="block text-xs text-muted mb-1">
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

// ── Credit plan selector ───────────────────────────────────────────────────────

function CreditOptions({
  total,
  installments,
  onInstallmentsChange,
  plans,
}: {
  total: number;
  installments: number;
  onInstallmentsChange: (n: number) => void;
  plans: CreditPlan[];
}) {
  const selectedPlan = plans.find((p) => p.installments === installments);
  const rate = selectedPlan ? Number(selectedPlan.interestRate) : 0;
  const monthly = installments > 0 ? (total * (1 + rate / 100)) / installments : 0;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Venta a crédito</p>
      <div>
        <label className="block text-xs font-medium text-muted mb-1">Plan de cuotas</label>
        <div className="flex gap-2 flex-wrap">
          {plans.map((plan) => (
            <button
              key={plan.installments}
              type="button"
              onClick={() => onInstallmentsChange(plan.installments)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors ${
                installments === plan.installments
                  ? 'border-ink bg-ink text-canvas'
                  : 'border-border-strong text-muted hover:border-border-strong'
              }`}
            >
              {plan.installments}x
            </button>
          ))}
        </div>
      </div>
      {installments > 0 && total > 0 && selectedPlan && (
        <p className="text-sm text-amber-800">
          Cuota estimada:{' '}
          <strong>{formatPrice(Math.ceil(monthly))}</strong> / mes
          {rate > 0 && <span className="text-xs text-amber-600 ml-1">({rate}% interés total)</span>}
        </p>
      )}
      <p className="text-xs text-amber-700">
        El pedido quedará en estado <strong>En evaluación</strong> hasta que el analista de crédito lo apruebe.
      </p>
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
  const { jwtPayload } = useAuth();
  const canManage = jwtPayload?.permissions.includes('sales:manage') ?? false;

  const [customerId, setCustomerId] = useState('');
  const [sellerId, setSellerId] = useState(canManage ? '' : (jwtPayload?.sub ?? ''));
  const [orderType, setOrderType] = useState<OrderType>('STANDARD');
  const [saleType, setSaleType] = useState<SaleType>('CASH');
  const [installments, setInstallments] = useState(0);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { productId: '', product: null, quantity: 1, unitPrice: 0, serialInput: '' },
  ]);
  const [error, setError] = useState('');

  // Delivery / zone surcharge
  const [showSurcharge, setShowSurcharge] = useState(false);
  const [surchargeType, setSurchargeType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [surchargeAmount, setSurchargeAmount] = useState(0);
  const [surchargeReason, setSurchargeReason] = useState('');

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
    enabled: canManage,
  });

  const { data: creditConfig } = useQuery({
    queryKey: ['credit-config'],
    queryFn: settingsApi.getCredit,
  });

  const activePlans = creditConfig?.isEnabled
    ? (creditConfig.plans ?? []).filter((p) => p.isActive)
    : [];
  const creditAvailable = activePlans.length > 0;

  // Auto-select first plan; reset to CASH if credit becomes unavailable
  useEffect(() => {
    if (!creditAvailable && saleType === 'CREDIT') setSaleType('CASH');
    if (creditAvailable && installments === 0) setInstallments(activePlans[0].installments);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditAvailable, activePlans.length]);

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const surchargeValue = showSurcharge && surchargeAmount > 0
    ? (surchargeType === 'PERCENTAGE' ? subtotal * (surchargeAmount / 100) : surchargeAmount)
    : 0;
  const total = subtotal + surchargeValue;

  const mutation = useMutation({
    mutationFn: () => {
      const dto: Parameters<typeof salesApi.createOrder>[0] = {
        customerId,
        sellerId: sellerId || undefined,
        saleType,
        installments: saleType === 'CREDIT' ? installments : undefined,
        notes: notes.trim() || undefined,
        items: items.map((it): CreateSaleOrderItem => ({
          productId: it.productId,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          serialNumbers: it.product?.isSerialized
            ? it.serialInput.split('\n').map((s) => s.trim()).filter(Boolean)
            : undefined,
        })),
        orderType,
        surchargeType: showSurcharge && surchargeAmount > 0 ? surchargeType : undefined,
        surchargeAmount: showSurcharge && surchargeAmount > 0 ? surchargeAmount : undefined,
        surchargeReason: showSurcharge && surchargeReason.trim() ? surchargeReason.trim() : undefined,
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

  const labelCls = 'block text-xs font-medium text-muted mb-1';
  const inputCls =
    'w-full rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Nuevo pedido</h2>
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
          {/* Cliente */}
          <div>
            <label className={labelCls}>Cliente *</label>
            <SearchSelect<Customer>
              items={customers}
              value={customerId}
              onChange={(id) => setCustomerId(id)}
              getKey={(c) => c.id}
              getLabel={(c) => `${c.firstName} ${c.lastName}`}
              getDescription={(c) =>
                [
                  c.documentNumber ?? null,
                  c.phone ?? null,
                ]
                  .filter(Boolean)
                  .join(' · ') || null
              }
              filterFn={(c, q) =>
                `${c.firstName} ${c.lastName} ${c.documentNumber ?? ''} ${c.customerCode ?? ''}`.toLowerCase().includes(q.toLowerCase())
              }
              placeholder="Buscar cliente..."
              emptyMessage="Sin clientes. Creá uno primero."
              required
            />
          </div>

          {/* Vendedor */}
          {canManage ? (
            <div>
              <label className={labelCls}>
                <span className="flex items-center gap-1"><UserCheck size={12} />Vendedor</span>
              </label>
              <select
                className={inputCls}
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
              >
                <option value="">— Sin asignar —</option>
                {allUsers.filter((u) => u.status === 'ACTIVE').map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
          ) : jwtPayload ? (
            <p className="text-xs text-faint flex items-center gap-1">
              <UserCheck size={12} />
              Vendedor: <strong className="text-muted">
                {allUsers.find((u) => u.id === jwtPayload.sub)?.firstName ?? 'tú'}
              </strong>
            </p>
          ) : null}

          {/* Tipo de pedido */}
          <div>
            <label className={labelCls}>Tipo de pedido</label>
            <div className="flex gap-3">
              {([['STANDARD', 'Pedido'], ['QUOTE', 'Presupuesto']] as [OrderType, string][]).map(([type, label]) => (
                <label
                  key={type}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
                    orderType === type
                      ? 'border-ink bg-ink text-canvas'
                      : 'border-border-strong text-muted hover:border-border-strong'
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    value={type}
                    checked={orderType === type}
                    onChange={() => setOrderType(type)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {orderType === 'QUOTE' && (
              <p className="mt-1.5 text-xs text-violet-600">
                El presupuesto no compromete stock. Se convierte en pedido cuando el cliente confirme.
              </p>
            )}
          </div>

          {/* Tipo de venta */}
          <div>
            <label className={labelCls}>Tipo de venta</label>
            <div className="flex gap-3">
              {(['CASH', ...(creditAvailable ? ['CREDIT'] : [])] as SaleType[]).map((type) => (
                <label
                  key={type}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
                    saleType === type
                      ? 'border-ink bg-ink text-canvas'
                      : 'border-border-strong text-muted hover:border-border-strong'
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    value={type}
                    checked={saleType === type}
                    onChange={() => setSaleType(type)}
                  />
                  {type === 'CASH' ? 'Contado' : 'Crédito'}
                </label>
              ))}
            </div>
          </div>

          {/* Opciones de crédito */}
          {saleType === 'CREDIT' && (
            <CreditOptions
              total={total}
              installments={installments}
              onInstallmentsChange={setInstallments}
              plans={activePlans}
            />
          )}

          {/* Productos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                Productos
              </p>
              <div className="text-xs text-muted hidden sm:flex gap-2 mr-8 pr-4">
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
                  onChange={(updated) =>
                    setItems((prev) => prev.map((it, i) => (i === idx ? updated : it)))
                  }
                  onRemove={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setItems((prev) => [
                  ...prev,
                  { productId: '', product: null, quantity: 1, unitPrice: 0, serialInput: '' },
                ])
              }
              className="mt-2 flex items-center gap-1.5 text-sm text-muted hover:text-ink"
            >
              <Plus size={14} />
              Agregar producto
            </button>
          </div>

          {/* Recargo de entrega / zona */}
          <div>
            <button
              type="button"
              onClick={() => setShowSurcharge((v) => !v)}
              className={`flex items-center gap-2 text-xs font-medium transition-colors ${showSurcharge ? 'text-ink' : 'text-muted hover:text-ink'}`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] transition-colors ${showSurcharge ? 'border-ink bg-ink text-canvas' : 'border-border-strong text-muted'}`}>
                {showSurcharge ? '−' : '+'}
              </span>
              Recargo de entrega / zona
              {surchargeValue > 0 && (
                <span className="ml-1 text-amber-600 font-semibold">+{formatPrice(surchargeValue)}</span>
              )}
            </button>

            {showSurcharge && (
              <div className="mt-3 rounded-lg border border-border bg-surface-2 px-4 py-3 space-y-3">
                {/* Tipo */}
                <div className="flex gap-2">
                  {([['PERCENTAGE', '% Porcentaje'], ['FIXED', '+ Valor fijo']] as ['PERCENTAGE' | 'FIXED', string][]).map(([t, label]) => (
                    <label
                      key={t}
                      className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                        surchargeType === t
                          ? 'border-ink bg-ink text-canvas'
                          : 'border-border-strong text-muted hover:border-border-strong'
                      }`}
                    >
                      <input type="radio" className="sr-only" checked={surchargeType === t} onChange={() => setSurchargeType(t)} />
                      {label}
                    </label>
                  ))}
                </div>

                {/* Valor + Motivo */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">
                      {surchargeType === 'PERCENTAGE' ? 'Porcentaje' : 'Monto fijo'}
                    </label>
                    <div className="relative">
                      <NumericInput
                        value={surchargeAmount}
                        onChange={setSurchargeAmount}
                        decimals={surchargeType === 'PERCENTAGE' ? 2 : 0}
                        placeholder="0"
                        className={inputCls}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">
                        {surchargeType === 'PERCENTAGE' ? '%' : 'Gs.'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">Motivo</label>
                    <select
                      className={inputCls}
                      value={surchargeReason}
                      onChange={(e) => setSurchargeReason(e.target.value)}
                    >
                      <option value="">— Seleccionar —</option>
                      <option value="Flete">Flete</option>
                      <option value="Zona lejana">Zona lejana</option>
                      <option value="Entrega urgente">Entrega urgente</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                </div>

                {/* Preview del cálculo */}
                {surchargeValue > 0 && (
                  <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 space-y-1">
                    <div className="flex justify-between text-xs text-muted">
                      <span>Subtotal productos</span>
                      <span className="font-mono tabular-nums">{formatPrice(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-amber-700">
                      <span>
                        Recargo{surchargeReason ? ` (${surchargeReason})` : ''}&nbsp;
                        {surchargeType === 'PERCENTAGE' ? `${surchargeAmount}%` : ''}
                      </span>
                      <span className="font-mono tabular-nums">+{formatPrice(surchargeValue)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-ink border-t border-amber-200 pt-1">
                      <span>Total con recargo</span>
                      <span className="font-mono tabular-nums">{formatPrice(total)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Total */}
          {items.length > 0 && (
            <div className="flex justify-end items-baseline gap-3 border-t border-border pt-3">
              {surchargeValue > 0 && (
                <span className="text-xs text-faint line-through tabular-nums">{formatPrice(subtotal)}</span>
              )}
              <span className="text-sm text-muted mr-1">Total estimado</span>
              <span className="text-sm font-bold text-ink tabular-nums">{formatPrice(total)}</span>
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

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-strong bg-surface text-ink px-4 py-2 text-sm text-muted hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50"
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

function OrderDetailPanel({ order, onClose }: { order: SaleOrder; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<'confirm' | 'cancel' | 'convert' | 'deliver' | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['sale-orders'] });
    setConfirmAction(null);
    onClose();
  };

  const confirmMutation  = useMutation({ mutationFn: () => salesApi.confirmOrder(order.id),  onSuccess: invalidate });
  const cancelMutation   = useMutation({ mutationFn: () => salesApi.cancelOrder(order.id),   onSuccess: invalidate });
  const convertMutation  = useMutation({ mutationFn: () => salesApi.convertQuote(order.id),  onSuccess: invalidate });
  const deliverMutation  = useMutation({ mutationFn: () => salesApi.deliverOrder(order.id),  onSuccess: invalidate });

  const total = orderTotal(order);
  const canConfirm  = order.status === 'PENDING' || order.status === 'CREDIT_APPROVED';
  const canConvert  = order.status === 'QUOTED';
  const canDeliver  = order.status === 'CONFIRMED';
  const canCancel   = ['QUOTED', 'PENDING', 'PENDING_CREDIT_APPROVAL', 'CREDIT_APPROVED', 'CREDIT_REJECTED'].includes(order.status);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative z-50 flex h-full w-full max-w-sm flex-col bg-surface shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-ink">
                {order.customer.firstName} {order.customer.lastName}
              </p>
              <StatusBadge status={order.status} />
              {order.saleType === 'CREDIT' && (
                <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Crédito {order.installments ? `${order.installments}x` : ''}
                </span>
              )}
            </div>
            {order.customer.documentNumber && (
              <p className="text-xs text-faint mt-0.5">
                {order.customer.documentType}: {order.customer.documentNumber}
              </p>
            )}
            <p className="text-xs text-faint mt-0.5">{formatDate(order.orderDate)}</p>
            {order.createdBy && (
              <p className="text-xs text-faint mt-0.5">
                Vendedor: {order.createdBy.firstName} {order.createdBy.lastName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 rounded-md p-1 text-faint hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Credit decision */}
        {order.status === 'CREDIT_APPROVED' && order.approvedBy && (
          <div className="border-b border-border px-5 py-3 bg-sky-50">
            <p className="text-xs text-sky-700">
              Aprobado por <strong>{order.approvedBy.firstName} {order.approvedBy.lastName}</strong>
              {order.approvedAt ? ` el ${formatDate(order.approvedAt)}` : ''}
            </p>
          </div>
        )}
        {order.status === 'CREDIT_REJECTED' && order.rejectedBy && (
          <div className="border-b border-border px-5 py-3 bg-red-50">
            <p className="text-xs text-red-700">
              Rechazado por <strong>{order.rejectedBy.firstName} {order.rejectedBy.lastName}</strong>
              {order.rejectedAt ? ` el ${formatDate(order.rejectedAt)}` : ''}
            </p>
            {order.rejectionReason && (
              <p className="text-xs text-red-600 mt-0.5">{order.rejectionReason}</p>
            )}
          </div>
        )}

        {/* Items */}
        <div className="border-b border-border px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">
            Productos
          </p>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate">{item.product.name}</p>
                  {item.product.model && (
                    <p className="text-xs text-faint">{item.product.model}</p>
                  )}
                  {item.productUnits.length > 0 && (
                    <p className="text-xs text-faint font-mono">
                      S/N: {item.productUnits.map((u) => u.serialNumber).join(', ')}
                    </p>
                  )}
                  {item.batch && (
                    <p className="text-xs text-faint">Lote: {item.batch.batchNumber}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-muted">
                    {item.quantity} × {formatPrice(item.unitPrice)}
                  </p>
                  <p className="text-sm font-medium text-ink">
                    {formatPrice(item.quantity * item.unitPrice)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {order.surchargeAmount && order.surchargeType && (
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs text-muted">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatPrice(orderSubtotal(order))}</span>
              </div>
              <div className="flex justify-between text-xs text-amber-700">
                <span>
                  Recargo{order.surchargeReason ? ` — ${order.surchargeReason}` : ''}
                  {order.surchargeType === 'PERCENTAGE' ? ` (${order.surchargeAmount}%)` : ''}
                </span>
                <span className="font-mono tabular-nums">+{formatPrice(orderSurchargeAmount(order, orderSubtotal(order)))}</span>
              </div>
            </div>
          )}
          <div className="flex justify-between items-center border-t border-border mt-3 pt-3">
            <span className="text-sm font-semibold text-muted">Total</span>
            <span className="text-base font-bold text-ink">{formatPrice(total)}</span>
          </div>
          {order.saleType === 'CREDIT' && order.installments && (
            <p className="text-xs text-muted text-right mt-1">
              {order.installments} cuotas de ≈ {formatPrice(Math.ceil(total / order.installments))}
            </p>
          )}
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-1">Notas</p>
            <p className="text-sm text-muted">{order.notes}</p>
          </div>
        )}

        {/* Invoice info */}
        {order.invoice && (
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-1">Factura</p>
            <p className="text-sm text-muted">Estado: {order.invoice.status}</p>
          </div>
        )}

        {/* Actions */}
        {(canConfirm || canConvert || canDeliver || canCancel) && (
          <div className="px-5 py-4 space-y-2">
            {confirmAction === null && (
              <>
                {canConvert && (
                  <button
                    onClick={() => setConfirmAction('convert')}
                    className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
                  >
                    Convertir a pedido
                  </button>
                )}
                {canConfirm && (
                  <button
                    onClick={() => setConfirmAction('confirm')}
                    className="w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80"
                  >
                    Confirmar pedido
                  </button>
                )}
                {canDeliver && (
                  <button
                    onClick={() => setConfirmAction('deliver')}
                    className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
                  >
                    Marcar como entregado
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={() => setConfirmAction('cancel')}
                    className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Cancelar pedido
                  </button>
                )}
              </>
            )}

            {confirmAction === 'convert' && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                <p className="text-xs text-violet-700 mb-2">
                  ¿Convertir el presupuesto en un pedido real?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => convertMutation.mutate()}
                    disabled={convertMutation.isPending}
                    className="flex-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {convertMutation.isPending ? 'Convirtiendo...' : 'Sí, convertir'}
                  </button>
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 rounded-lg border border-border-strong bg-surface text-ink px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2"
                  >
                    Volver
                  </button>
                </div>
                {convertMutation.isError && (
                  <p className="mt-2 text-xs text-red-600">
                    {(convertMutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al convertir'}
                  </p>
                )}
              </div>
            )}

            {confirmAction === 'confirm' && (
              <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
                <p className="text-xs text-muted mb-2">
                  ¿Confirmar el pedido? Esto descontará el stock.
                </p>
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
                    className="flex-1 rounded-lg border border-border-strong bg-surface text-ink px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2"
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

            {confirmAction === 'deliver' && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
                <p className="text-xs text-teal-700 mb-2">
                  ¿Marcar este pedido como entregado al cliente?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => deliverMutation.mutate()}
                    disabled={deliverMutation.isPending}
                    className="flex-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {deliverMutation.isPending ? 'Registrando...' : 'Sí, entregado'}
                  </button>
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 rounded-lg border border-border-strong bg-surface text-ink px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2"
                  >
                    Volver
                  </button>
                </div>
                {deliverMutation.isError && (
                  <p className="mt-2 text-xs text-red-600">
                    {(deliverMutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar entrega'}
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
                    className="flex-1 rounded-lg border border-border-strong bg-surface text-ink px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2"
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
    'rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm text-muted focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong bg-surface';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Ventas</h1>
          <p className="mt-1 text-sm text-muted">Pedidos</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80"
        >
          <Plus size={16} />
          Nuevo pedido
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            className="w-full rounded-lg border border-border-strong pl-8 pr-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong"
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
          <option value="QUOTED">Presupuesto</option>
          <option value="PENDING">Pendiente</option>
          <option value="PENDING_CREDIT_APPROVAL">En evaluación</option>
          <option value="CREDIT_APPROVED">Crédito aprobado</option>
          <option value="CREDIT_REJECTED">Crédito rechazado</option>
          <option value="CONFIRMED">Confirmado</option>
          <option value="DELIVERED">Entregado</option>
          <option value="INVOICED">Facturado</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-faint">Cargando pedidos...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-faint">No se encontraron pedidos.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm font-medium text-ink underline underline-offset-2"
          >
            Crear el primero
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Tipo</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Vendedor</th>
                <th className="px-4 py-3 text-center">Prods.</th>
                <th className="px-4 py-3 text-right">Total</th>
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
                    <div className="font-medium text-ink">
                      {order.customer.firstName} {order.customer.lastName}
                    </div>
                    {order.customer.documentNumber && (
                      <div className="text-xs text-faint">{order.customer.documentNumber}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(order.orderDate)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {order.saleType === 'CREDIT' ? (
                      <span className="text-xs font-medium text-amber-700">
                        Crédito {order.installments ? `${order.installments}x` : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">Contado</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted">
                    {(() => {
                      const s = order.seller ?? order.createdBy;
                      return s ? `${s.firstName} ${s.lastName}` : '—';
                    })()}
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
