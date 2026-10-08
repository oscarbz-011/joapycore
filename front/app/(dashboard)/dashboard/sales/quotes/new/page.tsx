'use client';

import { resolveWarehouseId, warehouseChoices } from '@/lib/sale-warehouse';
import { useSaleStock } from '@/lib/use-sale-stock';
import { apiErrorMessage } from '@/lib/api/api-error';
import { salesChannelProductFilters } from '@/lib/product-catalog';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { salesApi, type Customer, type CreateSaleOrderItem } from '../../../../../../lib/api/sales';
import { inventoryApi, type Product } from '../../../../../../lib/api/inventory';
import { useAuth } from '../../../../../../lib/auth-context';
import { NumericInput } from '../../../../../../components/numeric-input';
import { SearchSelect } from '../../../components/search-select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  NEW_CUSTOMER_ID_KEY,
  emptyProspect,
  prospectError,
  toProspectPayload,
  type ProspectForm,
} from '@/lib/quote-party';
import { cn } from '@/lib/utils';

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

interface QuoteLine {
  mode: 'CATALOG' | 'FREE';
  productId: string;
  product: Product | null;
  description: string;
  quantity: number;
  unitPrice: number;
  specNotes: string;
}

function emptyLine(): QuoteLine {
  return { mode: 'CATALOG', productId: '', product: null, description: '', quantity: 1, unitPrice: 0, specNotes: '' };
}

const DRAFT_KEY = 'sales:new-quote-draft';
// La clave que escribe el alta de cliente al volver (antes se leía otra y
// el presupuesto en curso se perdía).
const DRAFT_CUSTOMER_KEY = NEW_CUSTOMER_ID_KEY;

interface QuoteDraft {
  lines: Omit<QuoteLine, 'product'>[];
  notes: string;
}

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

// ── Line row ─────────────────────────────────────────────────────────────────

function QuoteLineRow({ line, products, onChange, onRemove }: {
  line: QuoteLine; products: Product[];
  onChange: (updated: QuoteLine) => void;
  onRemove: () => void;
}) {
  const subtotal = line.quantity * line.unitPrice;
  return (
    <div className="rounded-2xl border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {(['CATALOG', 'FREE'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ ...line, mode, productId: '', product: null, description: '' })}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                line.mode === mode ? 'bg-foreground text-background' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50',
              )}
            >
              {mode === 'CATALOG' ? 'Catálogo' : 'Libre'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button type="button" onClick={onRemove} className="text-muted-foreground/50 hover:text-destructive">
          <Trash2 size={15} />
        </button>
      </div>

      <div className="flex gap-2 items-start">
        <div className="flex-1">
          {line.mode === 'CATALOG' ? (
            <SearchSelect<Product>
              items={products}
              value={line.productId}
              onChange={(id, product) => onChange({ ...line, productId: id, product, unitPrice: product ? Number(product.salePrice) : 0 })}
              getKey={(p) => p.id}
              getLabel={(p) => `${p.name}${p.model ? ` (${p.model})` : ''}`}
              getDescription={(p) => p.category?.name ?? null}
              filterFn={(p, q) => `${p.name} ${p.model ?? ''} ${p.category?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())}
              placeholder="Buscar producto..."
              required
            />
          ) : (
            <Input
              value={line.description}
              onChange={(e) => onChange({ ...line, description: e.target.value })}
              placeholder="Descripción del ítem (ej. Mueble de cocina a medida)"
              required
            />
          )}
        </div>
        <div className="w-20">
          <NumericInput value={line.quantity} onChange={(v) => onChange({ ...line, quantity: Math.max(1, Math.round(v)) })} className={NUM_CLS} placeholder="Cant." />
        </div>
        <div className="w-32">
          <NumericInput value={line.unitPrice} onChange={(v) => onChange({ ...line, unitPrice: v })} className={NUM_CLS} placeholder="Precio" />
        </div>
        <div className="w-28 pt-2 text-right text-sm font-medium text-muted-foreground">{formatPrice(subtotal)}</div>
      </div>

      <div>
        <Textarea
          value={line.specNotes}
          onChange={(e) => onChange({ ...line, specNotes: e.target.value })}
          placeholder="Notas / especificaciones (dimensiones, materiales, etc. — opcional)"
          rows={1}
          className="text-xs resize-none"
        />
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NewQuotePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { jwtPayload } = useAuth();
  const canManage = jwtPayload?.permissions.includes('sales:quotes:manage') ?? false;

  const [customerId, setCustomerId] = useState('');
  // A quién va: un cliente registrado o datos cargados a mano.
  const [partyMode, setPartyMode] = useState<'customer' | 'prospect'>('customer');
  const [prospect, setProspect] = useState<ProspectForm>(emptyProspect());
  const [lines, setLines] = useState<QuoteLine[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { data: customers = [] } = useQuery({ queryKey: ['sale-customers'], queryFn: salesApi.listCustomers });
  const { data: products = [] } = useQuery({
    queryKey: ['products', 'NORMAL'],
    queryFn: () =>
      inventoryApi.listProducts(salesChannelProductFilters('NORMAL')),
  });

  // Al volver de crear un cliente nuevo, restaura el presupuesto en progreso
  // y selecciona el cliente recién creado (mismo patrón que "Nuevo pedido").
  useEffect(() => {
    const rawDraft = sessionStorage.getItem(DRAFT_KEY);
    const newCustomerId = sessionStorage.getItem(DRAFT_CUSTOMER_KEY);
    if (!rawDraft || !newCustomerId) return;
    sessionStorage.removeItem(DRAFT_KEY);
    sessionStorage.removeItem(DRAFT_CUSTOMER_KEY);
    try {
      const draft: QuoteDraft = JSON.parse(rawDraft);
    // Lectura de sessionStorage al montar: es sincronizar con un sistema
    // externo (no derivable en el render, que también corre en el servidor).
    // eslint-disable-next-line react-hooks/set-state-in-effect
      setLines(draft.lines.map((l) => ({ ...l, product: products.find((p) => p.id === l.productId) ?? null })));
      setNotes(draft.notes);
      setCustomerId(newCustomerId);
    } catch {
      // Borrador corrupto — se ignora.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToNewCustomer() {
    const draft: QuoteDraft = {
      lines: lines.map(({ mode, productId, description, quantity, unitPrice, specNotes }) => ({ mode, productId, description, quantity, unitPrice, specNotes })),
      notes,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    router.push('/dashboard/sales/customers/new?returnTo=/dashboard/sales/quotes/new');
  }

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  // Un presupuesto no mueve stock, pero el backend exige el depósito en todo
  // ítem con producto: se manda el sugerido.
  const stock = useSaleStock();

  const mutation = useMutation({
    mutationFn: () => {
      const dto: Parameters<typeof salesApi.createOrder>[0] = {
        ...(partyMode === 'customer'
          ? { customerId }
          : { prospect: toProspectPayload(prospect) }),
        orderType: 'QUOTE',
        notes: notes.trim() || undefined,
        items: lines.map((l): CreateSaleOrderItem => ({
          productId: l.mode === 'CATALOG' ? l.productId : undefined,
          description: l.mode === 'FREE' ? l.description.trim() : undefined,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          warehouseId:
            l.mode === 'CATALOG'
              ? resolveWarehouseId(undefined, warehouseChoices(stock, l.productId), Number(l.quantity)) || undefined
              : undefined,
          specNotes: l.specNotes.trim() || undefined,
        })),
      };
      return salesApi.createOrder(dto);
    },
    onSuccess: (order) => {
      void qc.invalidateQueries({ queryKey: ['sale-orders'] });
      router.push(`/dashboard/sales/quotes/${order.id}`);
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al crear el presupuesto'));
    },
  });

  if (!canManage) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground/60">No tenés permisos para acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/dashboard/sales/quotes')}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Nuevo presupuesto</h1>
          <p className="mt-1 text-sm text-muted-foreground">No compromete stock — se convierte en pedido cuando el cliente confirme.</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault(); setError('');
          const partyProblem =
            partyMode === 'customer'
              ? customerId ? null : 'Seleccioná un cliente'
              : prospectError(prospect);
          if (partyProblem) { setError(partyProblem); return; }
          if (lines.length === 0) { setError('Agregá al menos un ítem'); return; }
          mutation.mutate();
        }}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="min-w-0 space-y-6">
        {/* overflow-visible: la lista del buscador se despliega por fuera de la tarjeta. */}
        <Card className="gap-4 overflow-visible p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Para quién es</h2>
          <Tabs value={partyMode} onValueChange={(v) => setPartyMode(v as 'customer' | 'prospect')}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="customer" className="flex-1">Cliente registrado</TabsTrigger>
              <TabsTrigger value="prospect" className="flex-1">Persona o empresa sin registrar</TabsTrigger>
            </TabsList>
          </Tabs>

          {partyMode === 'prospect' && (
            <fieldset className="space-y-3">
              <legend className="mb-2 text-xs text-muted-foreground">
                Cargá los datos a mano. No se crea un cliente: recién hay que registrarlo si acepta el presupuesto y se convierte en pedido.
              </legend>
              <div>
                <Label htmlFor="prospect-name" className="mb-1 text-xs">Nombre o razón social *</Label>
                <Input
                  id="prospect-name"
                  value={prospect.name}
                  maxLength={150}
                  onChange={(e) => setProspect((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <Label htmlFor="prospect-document" className="mb-1 text-xs">CI o RUC</Label>
                  <Input
                    id="prospect-document"
                    value={prospect.document}
                    maxLength={30}
                    onChange={(e) => setProspect((p) => ({ ...p, document: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="prospect-phone" className="mb-1 text-xs">Teléfono</Label>
                  <Input
                    id="prospect-phone"
                    type="tel"
                    value={prospect.phone}
                    maxLength={40}
                    onChange={(e) => setProspect((p) => ({ ...p, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="prospect-email" className="mb-1 text-xs">Email</Label>
                  <Input
                    id="prospect-email"
                    type="email"
                    value={prospect.email}
                    maxLength={150}
                    onChange={(e) => setProspect((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="prospect-address" className="mb-1 text-xs">Dirección</Label>
                  <Input
                    id="prospect-address"
                    value={prospect.address}
                    maxLength={250}
                    onChange={(e) => setProspect((p) => ({ ...p, address: e.target.value }))}
                  />
                </div>
              </div>
            </fieldset>
          )}

          <div className={partyMode === 'customer' ? undefined : 'hidden'}>
            <Label className="mb-1 text-xs">Cliente *</Label>
            <SearchSelect<Customer>
              items={customers}
              value={customerId}
              onChange={(id) => setCustomerId(id)}
              getKey={(c) => c.id}
              getLabel={(c) => `${c.firstName} ${c.lastName}`}
              getDescription={(c) => [c.documentNumber ?? null, c.phone ?? null].filter(Boolean).join(' · ') || null}
              filterFn={(c, q) => `${c.firstName} ${c.lastName} ${c.documentNumber ?? ''} ${c.customerCode ?? ''}`.toLowerCase().includes(q.toLowerCase())}
              placeholder="Buscar cliente..."
              emptyMessage="No se encontró. Podés crear uno abajo."
              onCreate={goToNewCustomer}
              createLabel=" Crear cliente nuevo"
              required={partyMode === 'customer'}
            />
          </div>

        </Card>

        <Card className="gap-4 overflow-visible p-5">
          <div>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ítems</h2>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <QuoteLineRow
                  key={idx}
                  line={line}
                  products={products}
                  onChange={(updated) => setLines((prev) => prev.map((l, i) => (i === idx ? updated : l)))}
                  onRemove={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
              className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Plus size={14} /> Agregar ítem
            </button>
          </div>

        </Card>

        <Card className="gap-3 p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Notas</h2>
          <Textarea
            aria-label="Notas para el cliente"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones para el cliente (opcional)..."
            rows={3}
          />
        </Card>
        </div>

        {/* Resumen y acciones, siempre a la vista */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="gap-3 p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Resumen</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Ítems</dt>
                <dd className="tabular-nums text-foreground">{lines.length}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                <dt className="font-semibold text-foreground">Total estimado</dt>
                <dd className="font-mono text-lg font-bold tabular-nums text-foreground">{formatPrice(total)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              No compromete stock. Al guardarlo se genera el PDF del presupuesto.
            </p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Crear presupuesto'}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => router.push('/dashboard/sales/quotes')}>
              Cancelar
            </Button>
          </Card>
        </div>
      </form>
    </div>
  );
}
