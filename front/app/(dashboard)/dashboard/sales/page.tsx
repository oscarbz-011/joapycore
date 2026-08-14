'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X, Trash2, UserCheck, UserPlus } from 'lucide-react';

import { NumericInput } from '../../../../components/numeric-input';
import {
  salesApi,
  type Customer,
  type CreateSaleOrderItem,
  type DocumentType,
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });
}

function orderSubtotal(order: SaleOrder) {
  return order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
}

function orderSurchargeAmount(order: SaleOrder, subtotal: number): number {
  if (!order.surchargeType || !order.surchargeAmount) return 0;
  return order.surchargeType === 'PERCENTAGE' ? subtotal * (order.surchargeAmount / 100) : order.surchargeAmount;
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

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

// ── Line item row ──────────────────────────────────────────────────────────────

interface LineItem {
  productId: string;
  product: Product | null;
  quantity: number;
  unitPrice: number;
  serialInput: string;
}

function LineItemRow({ item, products, onChange, onRemove }: {
  item: LineItem; products: Product[];
  onChange: (updated: LineItem) => void;
  onRemove: () => void;
}) {
  const subtotal = item.quantity * item.unitPrice;
  return (
    <div className="rounded-2xl border border-border p-3 space-y-2">
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <SearchSelect<Product>
            items={products}
            value={item.productId}
            onChange={(id, product) => onChange({ ...item, productId: id, product, unitPrice: product ? Number(product.salePrice) : 0, serialInput: '' })}
            getKey={(p) => p.id}
            getLabel={(p) => `${p.name}${p.model ? ` (${p.model})` : ''}`}
            getDescription={(p) => p.category?.name ?? null}
            filterFn={(p, q) => `${p.name} ${p.model ?? ''} ${p.category?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())}
            placeholder="Buscar producto..."
            required
          />
        </div>
        <div className="w-20">
          <NumericInput
            value={item.quantity}
            onChange={(v) => onChange({ ...item, quantity: Math.max(1, Math.round(v)) })}
            placeholder="Cant."
            className={NUM_CLS}
            required
          />
        </div>
        <div className="w-32">
          <NumericInput
            value={item.unitPrice}
            onChange={(v) => onChange({ ...item, unitPrice: v })}
            placeholder="Precio"
            className={NUM_CLS}
            required
          />
        </div>
        <div className="w-28 pt-2 text-right text-sm font-medium text-muted-foreground">
          {formatPrice(subtotal)}
        </div>
        <button type="button" onClick={onRemove} className="pt-2 text-muted-foreground/50 hover:text-destructive">
          <Trash2 size={15} />
        </button>
      </div>
      {item.product?.isSerialized && (
        <div>
          <Label className="mb-1 text-xs">
            Números de serie (uno por línea, {item.quantity} requerido{item.quantity !== 1 ? 's' : ''})
          </Label>
          <Textarea
            className="font-mono text-xs"
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

function CreditOptions({ total, installments, onInstallmentsChange, plans }: {
  total: number; installments: number;
  onInstallmentsChange: (n: number) => void;
  plans: CreditPlan[];
}) {
  const selectedPlan = plans.find((p) => p.installments === installments);
  const rate = selectedPlan ? Number(selectedPlan.interestRate) : 0;
  const monthly = installments > 0 ? (total * (1 + rate / 100)) / installments : 0;

  return (
    <div className="rounded-2xl border border-warn/30 bg-warn-subtle/50 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-warn">Venta a crédito</p>
      <div>
        <Label className="mb-1 text-xs">Plan de cuotas</Label>
        <div className="flex gap-2 flex-wrap">
          {plans.map((plan) => (
            <Button
              key={plan.installments}
              type="button"
              size="sm"
              variant={installments === plan.installments ? 'default' : 'outline'}
              onClick={() => onInstallmentsChange(plan.installments)}
            >
              {plan.installments}x
            </Button>
          ))}
        </div>
      </div>
      {installments > 0 && total > 0 && selectedPlan && (
        <p className="text-sm text-warn">
          Cuota estimada: <strong>{formatPrice(Math.ceil(monthly))}</strong> / mes
          {rate > 0 && <span className="text-xs ml-1 opacity-70">({rate}% interés total)</span>}
        </p>
      )}
      <p className="text-xs text-warn/80">
        El pedido quedará en estado <strong>En evaluación</strong> hasta que el analista de crédito lo apruebe.
      </p>
    </div>
  );
}

// ── Quick-create customer form ─────────────────────────────────────────────────

function QuickCreateCustomerForm({ onCreated, onCancel }: {
  onCreated: (customer: Customer) => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [phone,     setPhone]     = useState('');
  const [docType,   setDocType]   = useState<DocumentType>('CI');
  const [docNum,    setDocNum]    = useState('');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => salesApi.createCustomer({
      firstName: firstName.trim(), lastName: lastName.trim(),
      phone: phone.trim() || undefined,
      documentType:   docNum.trim() ? docType : undefined,
      documentNumber: docNum.trim() || undefined,
    }),
    onSuccess: (customer) => {
      void qc.invalidateQueries({ queryKey: ['sale-customers'] });
      onCreated(customer);
    },
  });

  return (
    <div className="mt-2 rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus size={14} className="text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nuevo cliente</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1 text-xs">Nombre *</Label>
          <Input placeholder="Nombre" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div>
          <Label className="mb-1 text-xs">Apellido *</Label>
          <Input placeholder="Apellido" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div>
          <Label className="mb-1 text-xs">Teléfono</Label>
          <Input placeholder="09xx xxx xxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label className="mb-1 text-xs">Documento</Label>
          <div className="flex gap-1.5">
            <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
              <SelectTrigger className="w-auto">
                <span className="text-sm">{docType === 'PASSPORT' ? 'Pasaporte' : docType}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CI">CI</SelectItem>
                <SelectItem value="RUC">RUC</SelectItem>
                <SelectItem value="PASSPORT">Pasaporte</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Número" value={docNum} onChange={(e) => setDocNum(e.target.value)} />
          </div>
        </div>
      </div>
      {mutation.isError && (
        <p className="text-xs text-destructive">
          {(mutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al crear el cliente'}
        </p>
      )}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button
          type="button"
          size="sm"
          disabled={!firstName.trim() || !lastName.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Guardando...' : 'Guardar cliente'}
        </Button>
      </div>
    </div>
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

function CreateOrderModal({ open, onOpenChange, customers, products }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  products: Product[];
}) {
  const queryClient = useQueryClient();
  const { jwtPayload } = useAuth();
  const canManage = jwtPayload?.permissions.includes('sales:manage') ?? false;

  const [customerId,     setCustomerId]     = useState('');
  const [showQuickCust,  setShowQuickCust]  = useState(false);
  const [sellerId,       setSellerId]       = useState(canManage ? '' : (jwtPayload?.sub ?? ''));
  const [orderType,      setOrderType]      = useState<OrderType>('STANDARD');
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

  const { data: allUsers = [] } = useQuery({ queryKey: ['users'], queryFn: usersApi.list, enabled: canManage });
  const { data: liveCustomers = customers } = useQuery({ queryKey: ['sale-customers'], queryFn: salesApi.listCustomers, initialData: customers });
  const { data: creditConfig } = useQuery({ queryKey: ['credit-config'], queryFn: settingsApi.getCredit });

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
        })),
        orderType,
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
                onChange={(id) => { setCustomerId(id); setShowQuickCust(false); }}
                getKey={(c) => c.id}
                getLabel={(c) => `${c.firstName} ${c.lastName}`}
                getDescription={(c) => [c.documentNumber ?? null, c.phone ?? null].filter(Boolean).join(' · ') || null}
                filterFn={(c, q) =>
                  `${c.firstName} ${c.lastName} ${c.documentNumber ?? ''} ${c.customerCode ?? ''}`.toLowerCase().includes(q.toLowerCase())
                }
                placeholder="Buscar cliente..."
                emptyMessage="No se encontró. Podés crear uno abajo."
                onCreate={() => setShowQuickCust(true)}
                createLabel=" Crear cliente nuevo"
                required
              />
              {showQuickCust && (
                <QuickCreateCustomerForm
                  onCreated={(c) => { setCustomerId(c.id); setShowQuickCust(false); }}
                  onCancel={() => setShowQuickCust(false)}
                />
              )}
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

            {/* Tipo de pedido */}
            <div>
              <Label className="mb-1 text-xs">Tipo de pedido</Label>
              <div className="flex gap-3">
                {([['STANDARD', 'Pedido'], ['QUOTE', 'Presupuesto']] as [OrderType, string][]).map(([type, label]) => (
                  <label
                    key={type}
                    className={cn(
                      'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
                      orderType === type ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-border-strong',
                    )}
                  >
                    <input type="radio" className="sr-only" value={type} checked={orderType === type} onChange={() => setOrderType(type)} />
                    {label}
                  </label>
                ))}
              </div>
              {orderType === 'QUOTE' && (
                <p className="mt-1.5 text-xs text-violet-600 dark:text-violet-400">
                  El presupuesto no compromete stock. Se convierte en pedido cuando el cliente confirme.
                </p>
              )}
            </div>

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
                    <input type="radio" className="sr-only" value={type} checked={saleType === type} onChange={() => { if (type === 'CREDIT') setItems((prev) => prev.slice(0, 1)); setSaleType(type); }} />
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
                {items.map((item, idx) => (
                  <LineItemRow
                    key={idx}
                    item={item}
                    products={products}
                    onChange={(updated) => setItems((prev) => prev.map((it, i) => (i === idx ? updated : it)))}
                    onRemove={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  />
                ))}
              </div>
              {saleType === 'CASH' && (
                <button
                  type="button"
                  onClick={() => setItems((prev) => [...prev, { productId: '', product: null, quantity: 1, unitPrice: 0, serialInput: '' }])}
                  className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Plus size={14} />
                  Agregar producto
                </button>
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

function OrderDetailPanel({ open, onOpenChange, order }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: SaleOrder;
}) {
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
  const canCancel  = ['QUOTED', 'PENDING', 'PENDING_CREDIT_APPROVAL', 'CREDIT_APPROVED', 'CREDIT_REJECTED'].includes(order.status);

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
            <p className="text-xs text-muted-foreground">{formatDate(order.orderDate)}</p>
            {order.createdBy && <p className="text-xs text-muted-foreground">Vendedor: {order.createdBy.firstName} {order.createdBy.lastName}</p>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}><X size={16} /></Button>
        </SheetHeader>

        {/* Credit decision banners */}
        {order.status === 'CREDIT_APPROVED' && order.approvedBy && (
          <div className="border-b border-border px-5 py-3 bg-sky-50 dark:bg-sky-950">
            <p className="text-xs text-sky-700 dark:text-sky-300">
              Aprobado por <strong>{order.approvedBy.firstName} {order.approvedBy.lastName}</strong>
              {order.approvedAt ? ` el ${formatDate(order.approvedAt)}` : ''}
            </p>
          </div>
        )}
        {order.status === 'CREDIT_REJECTED' && order.rejectedBy && (
          <div className="border-b border-border px-5 py-3 bg-destructive/10">
            <p className="text-xs text-destructive">
              Rechazado por <strong>{order.rejectedBy.firstName} {order.rejectedBy.lastName}</strong>
              {order.rejectedAt ? ` el ${formatDate(order.rejectedAt)}` : ''}
            </p>
            {order.rejectionReason && <p className="text-xs text-destructive/80 mt-0.5">{order.rejectionReason}</p>}
          </div>
        )}

        {/* Items */}
        <div className="border-b border-border px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Productos</p>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{item.product.name}</p>
                  {item.product.model && <p className="text-xs text-muted-foreground">{item.product.model}</p>}
                  {item.productUnits.length > 0 && <p className="text-xs text-muted-foreground font-mono">S/N: {item.productUnits.map((u) => u.serialNumber).join(', ')}</p>}
                  {item.batch && <p className="text-xs text-muted-foreground">Lote: {item.batch.batchNumber}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-muted-foreground">{item.quantity} × {formatPrice(item.unitPrice)}</p>
                  <p className="text-sm font-medium text-foreground">{formatPrice(item.quantity * item.unitPrice)}</p>
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
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(order.orderDate)}</td>
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
