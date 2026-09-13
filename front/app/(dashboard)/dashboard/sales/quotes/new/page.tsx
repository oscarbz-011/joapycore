'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
const DRAFT_CUSTOMER_KEY = 'sales:new-quote-draft-customer-id';

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
  const [lines, setLines] = useState<QuoteLine[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { data: customers = [] } = useQuery({ queryKey: ['sale-customers'], queryFn: salesApi.listCustomers });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => inventoryApi.listProducts() });

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

  const mutation = useMutation({
    mutationFn: () => {
      const dto: Parameters<typeof salesApi.createOrder>[0] = {
        customerId,
        orderType: 'QUOTE',
        notes: notes.trim() || undefined,
        items: lines.map((l): CreateSaleOrderItem => ({
          productId: l.mode === 'CATALOG' ? l.productId : undefined,
          description: l.mode === 'FREE' ? l.description.trim() : undefined,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
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
    <div className="mx-auto max-w-2xl">
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
          if (!customerId) { setError('Seleccioná un cliente'); return; }
          if (lines.length === 0) { setError('Agregá al menos un ítem'); return; }
          mutation.mutate();
        }}
        className="space-y-5"
      >
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div>
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
              required
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Ítems</p>
            </div>
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

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm font-medium text-muted-foreground">Total estimado</span>
            <span className="text-lg font-semibold text-foreground">{formatPrice(total)}</span>
          </div>

          <div>
            <Label className="mb-1 text-xs">Notas (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones para el cliente..." rows={2} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => router.push('/dashboard/sales/quotes')}>Cancelar</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Guardando...' : 'Crear presupuesto'}</Button>
        </div>
      </form>
    </div>
  );
}
