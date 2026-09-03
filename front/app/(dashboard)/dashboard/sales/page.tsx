'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X, UserCheck, UserPlus } from 'lucide-react';

import { ContractCard } from '../../../../components/contract-card';
import { NumericInput } from '../../../../components/numeric-input';
import { NUM_CLS, type LineItem, LineItemRow, CreditOptions } from '../../../../components/sales/order-line-items';
import {
  salesApi,
  combosApi,
  type Customer,
  type CreateSaleOrderItem,
  type SaleCombo,
  type SaleOrder,
  type SaleOrderItem,
  type SaleOrderStatus,
  type SaleType,
} from '../../../../lib/api/sales';
import { inventoryApi, type Product } from '../../../../lib/api/inventory';
import { settingsApi } from '../../../../lib/api/settings';
import { usersApi } from '../../../../lib/api/users';
import { useAuth } from '../../../../lib/auth-context';
import { formatDatePY } from '../../../../lib/date';
import { SearchSelect } from '../components/search-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}


function orderSubtotal(order: SaleOrder) {
  return order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
}

function orderSurchargeAmount(order: SaleOrder, subtotal: number): number {
  if (!order.surchargeType || !order.surchargeAmount) return 0;
  return order.surchargeType === 'PERCENTAGE' ? subtotal * (order.surchargeAmount / 100) : order.surchargeAmount;
}

function itemUnitPrice(order: SaleOrder, item: SaleOrderItem): number {
  if (order.saleType === 'CREDIT' && item.financedUnitPrice != null) return item.financedUnitPrice;
  return item.unitPrice;
}

function orderTotal(order: SaleOrder) {
  const sub = orderSubtotal(order);
  const base = sub + orderSurchargeAmount(order, sub);
  if (order.saleType === 'CREDIT') {
    if (order.loan?.totalAmount) return Number(order.loan.totalAmount);
    if (order.interestRate) return base * (1 + Number(order.interestRate) / 100);
  }
  return base;
}

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<SaleOrderStatus, string> = {
  QUOTED:                  'Presupuesto',
  PENDING:                 'Pendiente',
  PAYMENT_RECEIVED:        'Cobrado',
  PENDING_CREDIT_APPROVAL: 'En evaluación',
  CREDIT_APPROVED:         'Crédito aprobado',
  CREDIT_REJECTED:         'Crédito rechazado',
  CREDIT_NEEDS_ADJUSTMENT: 'Necesita ajustes',
  CONFIRMED:               'Confirmado',
  DELIVERED:               'Entregado',
  INVOICED:                'Facturado',
  CANCELLED:               'Cancelado',
};

const STATUS_CLASS: Partial<Record<SaleOrderStatus, string>> = {
  QUOTED:                  'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800',
  PENDING:                 'bg-muted text-muted-foreground border-border',
  PAYMENT_RECEIVED:        'bg-accent-subtle text-accent-on border-accent-on/20',
  PENDING_CREDIT_APPROVAL: 'bg-warn-subtle text-warn border-warn/30',
  CREDIT_NEEDS_ADJUSTMENT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  CREDIT_APPROVED:         'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  CONFIRMED:               'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  DELIVERED:               'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800',
  INVOICED:                'bg-accent-subtle text-accent-on border-accent-on/20',
};

function StatusBadge({ status }: { status: SaleOrderStatus }) {
  const label = STATUS_LABEL[status] ?? status;
  const isDestructive = status === 'CREDIT_REJECTED' || status === 'CANCELLED';
  return (
    <Badge
      variant={isDestructive ? 'destructive' : 'outline'}
      className={isDestructive ? '' : STATUS_CLASS[status]}
    >
      {label}
    </Badge>
  );
}

// ── Seller role detection ──────────────────────────────────────────────────────

function isSeller(user: { status: string; roles: { name: string }[] }) {
  if (user.status !== 'ACTIVE') return false;
  return user.roles.some((r) => {
    const n = r.name.toLowerCase();
    return n.includes('vendedor') || n.includes('seller') || n.includes('vend') || n.includes('sales');
  });
}

// ── Create order modal ─────────────────────────────────────────────────────────

// Borrador del pedido en progreso — se guarda antes de navegar a la vista
// completa de alta de cliente y se restaura al volver, para no perder lo
// que ya se había cargado (items, vendedor, notas, recargo).
const ORDER_DRAFT_KEY = 'sales:new-order-draft';
const ORDER_DRAFT_CUSTOMER_KEY = 'sales:new-order-draft-customer-id';

interface OrderDraft {
  items: { productId: string; quantity: number; unitPrice: number; serialInput: string; comboGroupId?: string; comboId?: string; comboName?: string }[];
  sellerId: string;
  saleType: SaleType;
  installments: number;
  notes: string;
  showSurcharge: boolean;
  surchargeType: 'PERCENTAGE' | 'FIXED';
  surchargeAmount: number;
  surchargeReason: string;
}

function CreateOrderModal({ open, onOpenChange, customers, products }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  products: Product[];
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { jwtPayload } = useAuth();
  const canManage = jwtPayload?.permissions.includes('sales:manage') ?? false;

  const [customerId,     setCustomerId]     = useState('');
  const [sellerId,       setSellerId]       = useState(canManage ? '' : (jwtPayload?.sub ?? ''));
  const [saleType,       setSaleType]       = useState<SaleType>('CASH');
  const [installments,   setInstallments]   = useState(0);
  const [notes,          setNotes]          = useState('');
  const [items,          setItems]          = useState<LineItem[]>([
    { productId: '', product: null, quantity: 1, unitPrice: 0, serialInput: '' },
  ]);
  const [error, setError] = useState('');
  const [showSurcharge,   setShowSurcharge]   = useState(false);
  const [surchargeType,   setSurchargeType]   = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [surchargeAmount, setSurchargeAmount] = useState(0);
  const [surchargeReason, setSurchargeReason] = useState('');
  const [addMode, setAddMode] = useState<'ITEM' | 'COMBO'>('ITEM');

  const { data: allUsers = [] } = useQuery({ queryKey: ['users'], queryFn: usersApi.list, enabled: canManage });
  const { data: liveCustomers = customers } = useQuery({ queryKey: ['sale-customers'], queryFn: salesApi.listCustomers, initialData: customers });
  const { data: creditConfig } = useQuery({ queryKey: ['credit-config'], queryFn: settingsApi.getCredit });
  const { data: salesConfig } = useQuery({ queryKey: ['sales-config'], queryFn: settingsApi.getSalesConfig });
  const combosEnabled = salesConfig?.combosEnabled ?? false;
  const { data: combos = [] } = useQuery({ queryKey: ['sale-combos'], queryFn: () => combosApi.list(true), enabled: combosEnabled });

  function expandCombo(combo: SaleCombo) {
    const comboGroupId = crypto.randomUUID();
    const listTotal = combo.items.reduce((sum, i) => sum + i.product.salePrice * i.quantity, 0);
    const targetTotal = combo.priceMode === 'FIXED'
      ? (combo.fixedPrice ?? 0)
      : listTotal * (1 - (combo.discountPercentage ?? 0) / 100);

    const newLines: LineItem[] = combo.items.map((comboItem, idx) => {
      const lineListPrice = comboItem.product.salePrice * comboItem.quantity;
      // Reparte targetTotal proporcionalmente al peso de cada línea en el
      // precio de lista, así cada línea queda con un precio con sentido y
      // la suma da exacto — el ajuste de redondeo va en la última línea.
      const isLast = idx === combo.items.length - 1;
      const allocated = isLast
        ? targetTotal - combo.items.slice(0, -1).reduce((s, it) => {
            const w = (it.product.salePrice * it.quantity) / (listTotal || 1);
            return s + Math.round(targetTotal * w);
          }, 0)
        : Math.round(targetTotal * (lineListPrice / (listTotal || 1)));
      const product = products.find((p) => p.id === comboItem.productId) ?? null;
      return {
        productId: comboItem.productId,
        product,
        quantity: comboItem.quantity,
        unitPrice: comboItem.quantity > 0 ? allocated / comboItem.quantity : 0,
        serialInput: '',
        comboGroupId,
        comboId: combo.id,
        comboName: combo.name,
      };
    });

    setItems((prev) => {
      const withoutEmpty = prev.filter((it) => it.productId || it.comboGroupId);
      return [...withoutEmpty, ...newLines];
    });
  }

  // A crédito solo se permite "una unidad de compra" — un producto suelto o
  // un combo completo, nunca varios sueltos ni un combo más algo aparte
  // (a diferencia de contado, que admite cualquier combinación). Al pasar de
  // contado a crédito con varias líneas cargadas, se conserva solo la
  // primera unidad completa (el combo entero si la primera línea viene de
  // uno, o si no, solo esa primera línea suelta).
  function keepFirstPurchaseUnit(list: LineItem[]): LineItem[] {
    if (list.length === 0) return list;
    const first = list[0];
    if (first.comboGroupId) {
      return list.filter((it) => it.comboGroupId === first.comboGroupId);
    }
    return list.slice(0, 1);
  }

  // Al volver de crear un cliente nuevo desde la vista completa, restaura el
  // pedido en progreso y selecciona el cliente recién creado.
  useEffect(() => {
    const rawDraft = sessionStorage.getItem(ORDER_DRAFT_KEY);
    const newCustomerId = sessionStorage.getItem(ORDER_DRAFT_CUSTOMER_KEY);
    if (!rawDraft || !newCustomerId) return;
    sessionStorage.removeItem(ORDER_DRAFT_KEY);
    sessionStorage.removeItem(ORDER_DRAFT_CUSTOMER_KEY);
    try {
      const draft: OrderDraft = JSON.parse(rawDraft);
      setItems(draft.items.map((it) => ({ ...it, product: products.find((p) => p.id === it.productId) ?? null })));
      setSellerId(draft.sellerId);
      setSaleType(draft.saleType);
      setInstallments(draft.installments);
      setNotes(draft.notes);
      setShowSurcharge(draft.showSurcharge);
      setSurchargeType(draft.surchargeType);
      setSurchargeAmount(draft.surchargeAmount);
      setSurchargeReason(draft.surchargeReason);
      setCustomerId(newCustomerId);
      onOpenChange(true);
    } catch {
      // Borrador corrupto — se ignora, el usuario simplemente empieza de cero.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToNewCustomer() {
    const draft: OrderDraft = {
      items: items.map(({ productId, quantity, unitPrice, serialInput, comboGroupId, comboId, comboName }) => ({ productId, quantity, unitPrice, serialInput, comboGroupId, comboId, comboName })),
      sellerId, saleType, installments, notes,
      showSurcharge, surchargeType, surchargeAmount, surchargeReason,
    };
    sessionStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify(draft));
    router.push('/dashboard/sales/customers/new?returnTo=/dashboard/sales');
  }

  const activePlans = creditConfig?.isEnabled ? (creditConfig.plans ?? []).filter((p) => p.isActive) : [];
  const creditAvailable = activePlans.length > 0;

  useEffect(() => {
    if (!creditAvailable && saleType === 'CREDIT') {
      const id = setTimeout(() => setSaleType('CASH'), 0);
      return () => clearTimeout(id);
    }
    if (creditAvailable && installments === 0 && activePlans[0]) {
      const id = setTimeout(() => setInstallments(activePlans[0].installments), 0);
      return () => clearTimeout(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditAvailable, activePlans.length]);

  const sellers = allUsers.filter(isSeller);
  const sellerOptions = sellers.length > 0 ? sellers : allUsers.filter((u) => u.status === 'ACTIVE');

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const surchargeValue = showSurcharge && surchargeAmount > 0
    ? (surchargeType === 'PERCENTAGE' ? subtotal * (surchargeAmount / 100) : surchargeAmount)
    : 0;
  const total = subtotal + surchargeValue;

  const selectedCreditPlan = activePlans.find((p) => p.installments === installments);
  const creditRate = selectedCreditPlan ? Number(selectedCreditPlan.interestRate) : 0;
  const financedTotal = saleType === 'CREDIT' && creditRate > 0 ? total * (1 + creditRate / 100) : total;

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
          comboId: it.comboId,
          comboGroupId: it.comboGroupId,
        })),
        orderType: 'STANDARD',
        surchargeType:   showSurcharge && surchargeAmount > 0 ? surchargeType   : undefined,
        surchargeAmount: showSurcharge && surchargeAmount > 0 ? surchargeAmount : undefined,
        surchargeReason: showSurcharge && surchargeReason.trim() ? surchargeReason.trim() : undefined,
      };
      return salesApi.createOrder(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sale-orders'] });
      onOpenChange(false);
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al crear el pedido'));
    },
  });

  // Agrupa las líneas que comparten comboGroupId para renderizarlas juntas
  // con un único botón "Quitar combo" — las líneas individuales quedan cada
  // una en su propio grupo, sin cambio visual respecto de antes.
  const itemGroups: { comboGroupId?: string; comboName?: string; indices: number[] }[] = [];
  items.forEach((it, idx) => {
    if (it.comboGroupId) {
      const existing = itemGroups.find((g) => g.comboGroupId === it.comboGroupId);
      if (existing) existing.indices.push(idx);
      else itemGroups.push({ comboGroupId: it.comboGroupId, comboName: it.comboName, indices: [idx] });
    } else {
      itemGroups.push({ indices: [idx] });
    }
  });

  // A contado se puede seguir agregando líneas/combos libremente. A crédito
  // se admite una sola "unidad de compra" (un producto suelto o un combo
  // entero) — una vez que ya hay un producto elegido o un combo cargado, se
  // esconden los controles de agregar más.
  const hasAnyRealItem = items.some((it) => it.productId || it.comboGroupId);
  const canAddMore = saleType === 'CASH' || !hasAnyRealItem;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 sm:max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="flex-row items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle>Nuevo pedido</DialogTitle>
          <Button variant="ghost" size="icon-sm" type="button" onClick={() => onOpenChange(false)}><X size={16} /></Button>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault(); setError('');
            if (items.length === 0) { setError('Agregá al menos un producto'); return; }
            mutation.mutate();
          }}
          className="flex flex-col"
        >
          <div className="max-h-[calc(90vh-130px)] overflow-y-auto px-6 py-5 space-y-5">

            {/* Cliente */}
            <div>
              <Label className="mb-1 text-xs">Cliente *</Label>
              <SearchSelect<Customer>
                items={liveCustomers}
                value={customerId}
                onChange={(id) => setCustomerId(id)}
                getKey={(c) => c.id}
                getLabel={(c) => `${c.firstName} ${c.lastName}`}
                getDescription={(c) => [c.documentNumber ?? null, c.phone ?? null].filter(Boolean).join(' · ') || null}
                filterFn={(c, q) =>
                  `${c.firstName} ${c.lastName} ${c.documentNumber ?? ''} ${c.customerCode ?? ''}`.toLowerCase().includes(q.toLowerCase())
                }
                placeholder="Buscar cliente..."
                emptyMessage="No se encontró. Podés crear uno abajo."
                onCreate={goToNewCustomer}
                createLabel=" Crear cliente nuevo"
                required
              />
            </div>

            {/* Vendedor */}
            {canManage ? (
              <div>
                <Label className="mb-1 text-xs flex items-center gap-1"><UserCheck size={12} /> Vendedor</Label>
                <SearchSelect<(typeof sellerOptions)[0]>
                  items={sellerOptions}
                  value={sellerId}
                  onChange={(id) => setSellerId(id)}
                  getKey={(u) => u.id}
                  getLabel={(u) => `${u.firstName} ${u.lastName}`}
                  getDescription={(u) => u.roles.map((r) => r.name).join(', ') || null}
                  filterFn={(u, q) => `${u.firstName} ${u.lastName}`.toLowerCase().includes(q.toLowerCase())}
                  placeholder="— Sin asignar —"
                />
              </div>
            ) : jwtPayload ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <UserCheck size={12} />
                Vendedor: <strong className="text-foreground">tú</strong>
              </p>
            ) : null}

            {/* Item / Combo — solo si el tenant tiene combos habilitados. A
                crédito también se puede elegir un combo (un combo es "una
                unidad de compra" aunque tenga varias líneas), no solo a
                contado — pero el selector desaparece en cuanto ya hay una
                unidad cargada (canAddMore). */}
            {combosEnabled && canAddMore && (
              <div>
                <Label className="mb-1 text-xs">Agregar</Label>
                <div className="flex gap-3">
                  {([['ITEM', 'Item'], ['COMBO', 'Combo']] as [typeof addMode, string][]).map(([mode, label]) => (
                    <label
                      key={mode}
                      className={cn(
                        'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
                        addMode === mode ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-border-strong',
                      )}
                    >
                      <input type="radio" className="sr-only" value={mode} checked={addMode === mode} onChange={() => setAddMode(mode)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Tipo de venta */}
            <div>
              <Label className="mb-1 text-xs">Tipo de venta</Label>
              <div className="flex gap-3">
                {(['CASH', ...(creditAvailable ? ['CREDIT'] : [])] as SaleType[]).map((type) => (
                  <label
                    key={type}
                    className={cn(
                      'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
                      saleType === type ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-border-strong',
                    )}
                  >
                    <input type="radio" className="sr-only" value={type} checked={saleType === type} onChange={() => { if (type === 'CREDIT') setItems((prev) => keepFirstPurchaseUnit(prev)); setSaleType(type); }} />
                    {type === 'CASH' ? 'Contado' : 'Crédito'}
                  </label>
                ))}
              </div>
            </div>

            {saleType === 'CREDIT' && (
              <CreditOptions total={total} installments={installments} onInstallmentsChange={setInstallments} plans={activePlans} />
            )}

            {/* Productos */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Productos</p>
                <div className="hidden sm:flex gap-2 mr-8 pr-4 text-xs text-muted-foreground">
                  <span className="w-20 text-right">Cant.</span>
                  <span className="w-32 text-right">P. Unitario</span>
                  <span className="w-28 text-right">Subtotal</span>
                </div>
              </div>
              <div className="space-y-2">
                {itemGroups.map((group) =>
                  group.comboGroupId ? (
                    <div key={group.comboGroupId} className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-2 space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-medium text-violet-600 dark:text-violet-400">Combo: {group.comboName}</span>
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((it) => it.comboGroupId !== group.comboGroupId))}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          Quitar combo
                        </button>
                      </div>
                      {group.indices.map((idx) => (
                        <LineItemRow
                          key={idx}
                          item={items[idx]}
                          products={products}
                          onChange={(updated) => setItems((prev) => prev.map((it, i) => (i === idx ? updated : it)))}
                          onRemove={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        />
                      ))}
                    </div>
                  ) : (
                    group.indices.map((idx) => (
                      <LineItemRow
                        key={idx}
                        item={items[idx]}
                        products={products}
                        onChange={(updated) => setItems((prev) => prev.map((it, i) => (i === idx ? updated : it)))}
                        onRemove={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                      />
                    ))
                  ),
                )}
              </div>
              {canAddMore && addMode === 'ITEM' && (
                <button
                  type="button"
                  onClick={() => setItems((prev) => [...prev, { productId: '', product: null, quantity: 1, unitPrice: 0, serialInput: '' }])}
                  className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Plus size={14} />
                  Agregar producto
                </button>
              )}
              {canAddMore && addMode === 'COMBO' && (
                <div className="mt-2">
                  <SearchSelect<SaleCombo>
                    items={combos}
                    value=""
                    onChange={(_id, combo) => { if (combo) expandCombo(combo); }}
                    getKey={(c) => c.id}
                    getLabel={(c) => c.name}
                    getDescription={(c) => `${c.items.length} producto${c.items.length !== 1 ? 's' : ''}`}
                    filterFn={(c, q) => c.name.toLowerCase().includes(q.toLowerCase())}
                    placeholder="Buscar combo..."
                    emptyMessage="No hay combos activos."
                  />
                </div>
              )}
            </div>

            {/* Recargo */}
            <div>
              <button
                type="button"
                onClick={() => setShowSurcharge((v) => !v)}
                className={cn('flex items-center gap-2 text-xs font-medium transition-colors', showSurcharge ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <span className={cn('flex size-4 items-center justify-center rounded border text-[10px] transition-colors', showSurcharge ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground')}>
                  {showSurcharge ? '−' : '+'}
                </span>
                Recargo de entrega / zona
                {surchargeValue > 0 && <span className="ml-1 text-warn font-semibold">+{formatPrice(surchargeValue)}</span>}
              </button>

              {showSurcharge && (
                <div className="mt-3 rounded-2xl border border-border bg-muted/30 px-4 py-3 space-y-3">
                  <div className="flex gap-2">
                    {([['PERCENTAGE', '% Porcentaje'], ['FIXED', '+ Valor fijo']] as ['PERCENTAGE' | 'FIXED', string][]).map(([t, label]) => (
                      <label key={t} className={cn('flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors', surchargeType === t ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-border-strong')}>
                        <input type="radio" className="sr-only" checked={surchargeType === t} onChange={() => setSurchargeType(t)} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1 text-xs">{surchargeType === 'PERCENTAGE' ? 'Porcentaje' : 'Monto fijo'}</Label>
                      <div className="relative">
                        <NumericInput value={surchargeAmount} onChange={setSurchargeAmount} decimals={surchargeType === 'PERCENTAGE' ? 2 : 0} placeholder="0" className={cn(NUM_CLS, 'pr-8')} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">{surchargeType === 'PERCENTAGE' ? '%' : 'Gs.'}</span>
                      </div>
                    </div>
                    <div>
                      <Label className="mb-1 text-xs">Motivo</Label>
                      <Select value={surchargeReason || 'none'} onValueChange={(v) => setSurchargeReason(v === 'none' ? '' : v)}>
                        <SelectTrigger className="w-full">
                          <span className="flex-1 text-left text-sm truncate">{surchargeReason || '— Seleccionar —'}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Seleccionar —</SelectItem>
                          <SelectItem value="Flete">Flete</SelectItem>
                          <SelectItem value="Zona lejana">Zona lejana</SelectItem>
                          <SelectItem value="Entrega urgente">Entrega urgente</SelectItem>
                          <SelectItem value="Otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {surchargeValue > 0 && (
                    <div className="rounded-xl border border-warn/20 bg-warn-subtle/50 px-3 py-2 space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Subtotal productos</span><span className="font-mono tabular-nums">{formatPrice(subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-warn">
                        <span>Recargo{surchargeReason ? ` (${surchargeReason})` : ''} {surchargeType === 'PERCENTAGE' ? `${surchargeAmount}%` : ''}</span>
                        <span className="font-mono tabular-nums">+{formatPrice(surchargeValue)}</span>
                      </div>
                      <div className="flex justify-between border-t border-warn/20 pt-1 text-xs font-semibold text-foreground">
                        <span>Total con recargo</span><span className="font-mono tabular-nums">{formatPrice(total)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Total */}
            {items.length > 0 && (
              <div className="flex justify-end items-baseline gap-3 border-t border-border pt-3">
                {(surchargeValue > 0 || (saleType === 'CREDIT' && creditRate > 0)) && (
                  <span className="text-xs text-muted-foreground line-through tabular-nums">{formatPrice(surchargeValue > 0 ? subtotal : total)}</span>
                )}
                <span className="text-sm text-muted-foreground mr-1">{saleType === 'CREDIT' ? 'Total financiado' : 'Total estimado'}</span>
                <span className="text-sm font-bold text-foreground tabular-nums">{formatPrice(saleType === 'CREDIT' ? financedTotal : total)}</span>
              </div>
            )}

            {/* Notas */}
            <div>
              <Label className="mb-1 text-xs">Notas (opcional)</Label>
              <Textarea rows={2} placeholder="Instrucciones de entrega, observaciones..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {error && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando...' : 'Crear pedido'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Order detail panel ─────────────────────────────────────────────────────────

const ADJUSTMENT_LABELS: Record<string, string> = {
  LOWER_VALUE_PRODUCT: 'Ofrecer un producto de menor valor',
  MORE_INSTALLMENTS: 'Aumentar la cantidad de cuotas',
  ADD_GUARANTOR: 'Agregar uno o más garantes',
};

function OrderDetailPanel({ open, onOpenChange, order }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: SaleOrder;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<'confirm' | 'cancel' | 'convert' | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['sale-orders'] });
    setConfirmAction(null);
    onOpenChange(false);
  };

  const confirmMutation = useMutation({ mutationFn: () => salesApi.confirmOrder(order.id),  onSuccess: invalidate });
  const cancelMutation  = useMutation({ mutationFn: () => salesApi.cancelOrder(order.id),   onSuccess: invalidate });
  const convertMutation = useMutation({ mutationFn: () => salesApi.convertQuote(order.id),  onSuccess: invalidate });

  const total = orderTotal(order);
  const canConfirm = order.status === 'PENDING' || order.status === 'CREDIT_APPROVED';
  const canConvert = order.status === 'QUOTED';
  const canCancel  = ['QUOTED', 'PENDING', 'PENDING_CREDIT_APPROVAL', 'CREDIT_APPROVED', 'CREDIT_REJECTED', 'CREDIT_NEEDS_ADJUSTMENT'].includes(order.status);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col overflow-y-auto p-0 sm:max-w-sm" showCloseButton={false}>
        {/* Header */}
        <SheetHeader className="flex-row items-start justify-between border-b border-border px-5 py-4 gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <SheetTitle className="text-base">{order.customer.firstName} {order.customer.lastName}</SheetTitle>
              <StatusBadge status={order.status} />
              {order.saleType === 'CREDIT' && (
                <Badge className="bg-warn-subtle text-warn border-warn/30">
                  Crédito {order.installments ? `${order.installments}x` : ''}
                </Badge>
              )}
            </div>
            {order.customer.documentNumber && <p className="text-xs text-muted-foreground">{order.customer.documentType}: {order.customer.documentNumber}</p>}
            <p className="text-xs text-muted-foreground">{formatDatePY(order.orderDate, 'local')}</p>
            {(order.seller ?? order.createdBy) && (
              <p className="text-xs text-muted-foreground">
                Vendedor: {(order.seller ?? order.createdBy)!.firstName} {(order.seller ?? order.createdBy)!.lastName}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}><X size={16} /></Button>
        </SheetHeader>

        {/* Credit decision banners */}
        {order.status === 'CREDIT_APPROVED' && order.approvedBy && (
          <div className="border-b border-border px-5 py-3 bg-sky-50 dark:bg-sky-950">
            <p className="text-xs text-sky-700 dark:text-sky-300">
              Aprobado por <strong>{order.approvedBy.firstName} {order.approvedBy.lastName}</strong>
              {order.approvedAt ? ` el ${formatDatePY(order.approvedAt, 'local')}` : ''}
            </p>
          </div>
        )}
        {order.status === 'CREDIT_REJECTED' && order.rejectedBy && (
          <div className="border-b border-border px-5 py-3 bg-destructive/10">
            <p className="text-xs text-destructive">
              Rechazado por <strong>{order.rejectedBy.firstName} {order.rejectedBy.lastName}</strong>
              {order.rejectedAt ? ` el ${formatDatePY(order.rejectedAt, 'local')}` : ''}
            </p>
            {order.rejectionReason && <p className="text-xs text-destructive/80 mt-0.5">{order.rejectionReason}</p>}
          </div>
        )}
        {order.status === 'CREDIT_NEEDS_ADJUSTMENT' && (
          <div className="border-b border-border px-5 py-3 bg-amber-50 dark:bg-amber-950/30 space-y-2">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">El analista pidió ajustes en este pedido</p>
            {order.suggestedAlternatives.length > 0 && (
              <ul className="text-xs text-amber-700/90 dark:text-amber-300/90 list-disc list-inside">
                {order.suggestedAlternatives.map((alt) => (
                  <li key={alt}>{ADJUSTMENT_LABELS[alt] ?? alt}</li>
                ))}
              </ul>
            )}
            {order.adjustmentNote && <p className="text-xs text-amber-700/80 dark:text-amber-300/80">{order.adjustmentNote}</p>}
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                router.push(`/dashboard/sales/${order.id}/adjust`);
              }}
            >
              <UserPlus size={14} />
              Ajustar pedido
            </Button>
          </div>
        )}

        {/* Guarantors */}
        {order.guarantors.length > 0 && (
          <div className="border-b border-border px-5 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Garantes</p>
            <div className="space-y-2">
              {order.guarantors.map((g) => (
                <div key={g.id} className="text-sm">
                  <p className="text-foreground">{g.firstName} {g.lastName}</p>
                  <p className="text-xs text-muted-foreground">{g.documentType}: {g.documentNumber}{g.phone ? ` · ${g.phone}` : ''}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="border-b border-border px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Productos</p>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{item.product?.name ?? item.description ?? 'Ítem'}</p>
                  {item.product?.model && <p className="text-xs text-muted-foreground">{item.product.model}</p>}
                  {item.productUnits.length > 0 && <p className="text-xs text-muted-foreground font-mono">S/N: {item.productUnits.map((u) => u.serialNumber).join(', ')}</p>}
                  {item.batch && <p className="text-xs text-muted-foreground">Lote: {item.batch.batchNumber}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-muted-foreground">{item.quantity} × {formatPrice(itemUnitPrice(order, item))}</p>
                  <p className="text-sm font-medium text-foreground">{formatPrice(item.quantity * itemUnitPrice(order, item))}</p>
                </div>
              </div>
            ))}
          </div>

          {order.surchargeAmount && order.surchargeType && (
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtotal</span><span className="font-mono tabular-nums">{formatPrice(orderSubtotal(order))}</span>
              </div>
              <div className="flex justify-between text-xs text-warn">
                <span>Recargo{order.surchargeReason ? ` — ${order.surchargeReason}` : ''}{order.surchargeType === 'PERCENTAGE' ? ` (${order.surchargeAmount}%)` : ''}</span>
                <span className="font-mono tabular-nums">+{formatPrice(orderSurchargeAmount(order, orderSubtotal(order)))}</span>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center border-t border-border mt-3 pt-3">
            <span className="text-sm font-semibold text-muted-foreground">Total</span>
            <span className="text-base font-bold text-foreground">{formatPrice(total)}</span>
          </div>
          {order.saleType === 'CREDIT' && order.installments && (
            <p className="text-xs text-muted-foreground text-right mt-1">
              {order.installments} cuotas de ≈ {formatPrice(Math.ceil(total / order.installments))}
            </p>
          )}
        </div>

        {order.notes && (
          <div className="border-b border-border px-5 py-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Notas</p>
            <p className="text-sm text-muted-foreground">{order.notes}</p>
          </div>
        )}
        {order.invoice && (
          <div className="border-b border-border px-5 py-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Factura</p>
            <p className="text-sm text-muted-foreground">Estado: {order.invoice.status}</p>
          </div>
        )}

        {order.saleType === 'CREDIT' && order.invoice && (
          <div className="border-b border-border px-5 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Contrato</p>
            <ContractCard entityType="sale_order" entityId={order.id} />
          </div>
        )}

        {/* Actions */}
        {(canConfirm || canConvert || canCancel) && (
          <div className="px-5 py-4 space-y-2">
            {confirmAction === null && (
              <>
                {canConvert && (
                  <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white dark:bg-violet-700 dark:hover:bg-violet-800" onClick={() => setConfirmAction('convert')}>
                    Convertir a pedido
                  </Button>
                )}
                {canConfirm && (
                  <Button className="w-full" onClick={() => setConfirmAction('confirm')}>
                    Confirmar pedido
                  </Button>
                )}
                {canCancel && (
                  <Button variant="outline" className="w-full border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setConfirmAction('cancel')}>
                    Cancelar pedido
                  </Button>
                )}
              </>
            )}

            {confirmAction === 'convert' && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 dark:bg-violet-950 dark:border-violet-800 px-4 py-3 space-y-2">
                <p className="text-xs text-violet-700 dark:text-violet-300">¿Convertir el presupuesto en un pedido real?</p>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" disabled={convertMutation.isPending} onClick={() => convertMutation.mutate()}>
                    {convertMutation.isPending ? 'Convirtiendo...' : 'Sí, convertir'}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirmAction(null)}>Volver</Button>
                </div>
                {convertMutation.isError && (
                  <p className="text-xs text-destructive">{(convertMutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al convertir'}</p>
                )}
              </div>
            )}

            {confirmAction === 'confirm' && (
              <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 space-y-2">
                <p className="text-xs text-muted-foreground">¿Confirmar el pedido? Esto generará la factura y habilitará el cobro desde Cuentas por cobrar.</p>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
                    {confirmMutation.isPending ? 'Confirmando...' : 'Sí, confirmar'}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirmAction(null)}>Volver</Button>
                </div>
                {confirmMutation.isError && (
                  <p className="text-xs text-destructive">{(confirmMutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al confirmar'}</p>
                )}
              </div>
            )}

            {confirmAction === 'cancel' && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 space-y-2">
                <p className="text-xs text-destructive">¿Cancelar este pedido?</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" className="flex-1" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
                    {cancelMutation.isPending ? 'Cancelando...' : 'Sí, cancelar'}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirmAction(null)}>Volver</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<'' | SaleOrderStatus>('');
  const [showCreate, setShowCreate]       = useState(false);
  const [panelOrder, setPanelOrder]       = useState<SaleOrder | null>(null);
  const [panelOpen, setPanelOpen]         = useState(false);

  const { data: orders = [], isLoading } = useQuery({ queryKey: ['sale-orders'], queryFn: salesApi.listOrders });
  const { data: customers = [] } = useQuery({ queryKey: ['sale-customers'], queryFn: salesApi.listCustomers });
  const { data: products = [] } = useQuery({ queryKey: ['inventory-products-active'], queryFn: () => inventoryApi.listProducts({ isActive: true }) });

  const filtered = orders.filter((o) => {
    const name = `${o.customer.firstName} ${o.customer.lastName}`.toLowerCase();
    return (!search || name.includes(search.toLowerCase())) && (!statusFilter || o.status === statusFilter);
  });

  function openPanel(order: SaleOrder) { setPanelOrder(order); setPanelOpen(true); }
  function closePanel(open: boolean) { if (!open) { setPanelOpen(false); } }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">Ventas</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">Pedidos</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus size={16} />
          Nuevo pedido
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <Input className="pl-8" placeholder="Buscar por cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v as SaleOrderStatus)}>
          <SelectTrigger>
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {statusFilter ? STATUS_LABEL[statusFilter as SaleOrderStatus] : 'Todos los estados'}
            </span>
          </SelectTrigger>
          <SelectContent className="w-auto min-w-[11rem]">
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="QUOTED">Presupuesto</SelectItem>
            <SelectItem value="PENDING">Pendiente</SelectItem>
            <SelectItem value="PENDING_CREDIT_APPROVAL">En evaluación</SelectItem>
            <SelectItem value="CREDIT_APPROVED">Crédito aprobado</SelectItem>
            <SelectItem value="CREDIT_REJECTED">Crédito rechazado</SelectItem>
            <SelectItem value="CONFIRMED">Confirmado</SelectItem>
            <SelectItem value="DELIVERED">Entregado</SelectItem>
            <SelectItem value="INVOICED">Facturado</SelectItem>
            <SelectItem value="CANCELLED">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Cargando pedidos...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">No se encontraron pedidos.</p>
          <Button variant="link" className="mt-2" onClick={() => setShowCreate(true)}>Crear el primero</Button>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
                  <tr key={order.id} onClick={() => openPanel(order)} className="cursor-pointer hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{order.customer.firstName} {order.customer.lastName}</div>
                      {order.customer.documentNumber && <div className="text-xs text-muted-foreground">{order.customer.documentNumber}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDatePY(order.orderDate, 'local')}</td>
                    <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {order.saleType === 'CREDIT'
                        ? <Badge className="bg-warn-subtle text-warn border-warn/30">Crédito {order.installments ? `${order.installments}x` : ''}</Badge>
                        : <span className="text-xs text-muted-foreground">Contado</span>
                      }
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {(() => { const s = order.seller ?? order.createdBy; return s ? `${s.firstName} ${s.lastName}` : '—'; })()}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{order.items.length}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-foreground">{formatPrice(orderTotal(order))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Separator className="hidden" />

      <CreateOrderModal open={showCreate} onOpenChange={setShowCreate} customers={customers} products={products} />

      {panelOrder && (
        <OrderDetailPanel open={panelOpen} onOpenChange={closePanel} order={panelOrder} />
      )}
    </div>
  );
}
