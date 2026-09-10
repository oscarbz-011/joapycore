'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight, Package, Search, SlidersHorizontal, Plus, X, ChevronDown, ChartBarStacked,
} from 'lucide-react';
import { NumericInput } from '../../../../components/numeric-input';
import {
  inventoryApi,
  PRODUCT_KIND_HINT,
  PRODUCT_KIND_LABEL,
  PRODUCT_STATUS_LABEL,
  type Brand,
  type Category,
  type CreateProductPayload,
  type MarkupType,
  type Product,
  type ProductKind,
  type ProductStatus,
  type ProductWithStock,
} from '../../../../lib/api/inventory';
import { tenantsApi } from '../../../../lib/api/tenants';
import { settingsApi } from '../../../../lib/api/settings';
import {
  computeAdditionalAmount,
  computeGlobalMarkupAmount,
  computeSuggestedPrice,
} from '../../../../lib/pricing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtGs(n: number) {
  return 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
}

function markup(p: Product) {
  // Un producto en borrador puede no tener precios todavía (null) — no hay
  // margen que mostrar, no es un margen de 0.
  if (!p.costPrice || !p.salePrice || p.costPrice <= 0) return null;
  return ((p.salePrice - p.costPrice) / p.costPrice) * 100;
}

// ── Estado de la ficha ─────────────────────────────────────────────────────────

// Solo se muestra cuando NO es reventa: en un negocio que solo revende, el
// tipo es siempre el mismo y etiquetarlo en cada fila sería ruido.
function KindBadge({ kind }: { kind: ProductKind }) {
  if (kind === 'RESALE') return null;
  return (
    <Badge variant="outline" className="text-[10.5px] font-normal">
      {PRODUCT_KIND_LABEL[kind]}
    </Badge>
  );
}

function StatusBadge({ status }: { status: ProductStatus }) {
  if (status === 'ACTIVE') return null; // el estado normal no necesita ruido visual
  if (status === 'DRAFT')
    return <Badge className="bg-warn-subtle text-warn border-warn/30 hover:bg-warn-subtle">Borrador</Badge>;
  if (status === 'BLOCKED') return <Badge variant="destructive">Bloqueado</Badge>;
  return <Badge variant="secondary">Descontinuado</Badge>;
}

// ── Stock badge ────────────────────────────────────────────────────────────────

function StockBadge({ stock }: { stock: number }) {
  if (stock === 0) return <Badge variant="destructive">Agotado</Badge>;
  if (stock <= 3)  return <Badge className="bg-warn-subtle text-warn border-warn/30 hover:bg-warn-subtle">{stock} u.</Badge>;
  return <Badge variant="secondary">{stock} u.</Badge>;
}

// ── KPI mini-card ──────────────────────────────────────────────────────────────

function InventoryKpi({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-[12.5px] font-medium text-muted-foreground">{label}</p>
        <p className={cn('mt-0.5 text-[22px] font-extrabold tabular-nums', danger ? 'text-destructive' : 'text-foreground')}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Tab nav ────────────────────────────────────────────────────────────────────

function InventoryNav({ active }: { active: 'products' | 'movements' | 'config' }) {
  const items = [
    { key: 'products'  as const, label: 'Productos',   href: '/dashboard/inventory',           icon: Package        },
    { key: 'movements' as const, label: 'Movimientos', href: '/dashboard/inventory/movements', icon: ArrowLeftRight },
    { key: 'config'    as const, label: 'Categorías',  href: '/dashboard/inventory/config',    icon: ChartBarStacked },
  ];
  return (
    <div className="mb-5 flex border-b border-border">
      {items.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          className={cn(
            '-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors',
            active === key
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon size={14} />
          {label}
        </Link>
      ))}
    </div>
  );
}

// ── Product modal ──────────────────────────────────────────────────────────────

// Los precios viven como number en el form (0 = "sin cargar") y recién al
// enviar se traducen a undefined, que es como el backend distingue "pendiente"
// de un precio real de cero. Ver ProductStatus / ARCHITECTURE.md v0.51.
type ProductForm = Omit<CreateProductPayload, 'costPrice' | 'salePrice'> & {
  costPrice: number;
  salePrice: number;
};

const EMPTY_FORM: ProductForm = {
  categoryId: '', brandId: '', name: '', model: '', description: '',
  isSerialized: false, usesLots: false, unit: 'unidad', costPrice: 0, salePrice: 0,
};

function ProductModal({
  open, onOpenChange, categories, brands, initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  brands: Brand[];
  initial?: Product;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProductForm>(
    initial
      ? { categoryId: initial.category?.id ?? '', brandId: initial.brand?.id ?? '', name: initial.name,
          model: initial.model ?? '', description: initial.description ?? '', isSerialized: initial.isSerialized,
          usesLots: initial.usesLots,
          unit: initial.unit, costPrice: initial.costPrice ?? 0, salePrice: initial.salePrice ?? 0 }
      : EMPTY_FORM,
  );
  const [error, setError] = useState('');
  const [additionalMarkupType, setAdditionalMarkupType] = useState<MarkupType>(initial?.additionalMarkupType ?? 'PERCENTAGE');
  const [additionalMarkup, setAdditionalMarkup]         = useState(initial?.additionalMarkup ?? 0);
  const [showAdditionalMarkup, setShowAdditionalMarkup] = useState((initial?.additionalMarkup ?? 0) > 0);

  const { data: pricingConfig } = useQuery({ queryKey: ['pricing-config'], queryFn: settingsApi.getPricing });
  // El rubro decide con qué tipo arranca un producto nuevo (una carpintería
  // fabrica lo que vende, el resto revende). Al editar se respeta el que ya
  // tiene la ficha. El backend aplica el mismo default si no se manda nada.
  const { data: tenant } = useQuery({ queryKey: ['tenant-me'], queryFn: tenantsApi.getMe });
  // Derivado, no sincronizado: el estado guarda solo la elección explícita del
  // usuario y el default sale del rubro en cada render. Así no hace falta un
  // efecto ni un ref para "ya apliqué el default" (que además dependería de
  // cuándo llega la query del tenant).
  const [kindOverride, setKindOverride] = useState<ProductKind | null>(initial?.kind ?? null);
  const kind: ProductKind =
    kindOverride ?? (tenant?.industry === 'MUEBLERIA' ? 'MANUFACTURED' : 'RESALE');
  const setKind = setKindOverride;

  const lastComputedRef = useRef<number>(initial?.salePrice ?? 0);
  useEffect(() => {
    if (!pricingConfig || form.costPrice <= 0) return;
    const suggested = computeSuggestedPrice(form.costPrice, pricingConfig, additionalMarkup, additionalMarkupType);
    if (form.salePrice === 0 || form.salePrice === lastComputedRef.current) {
      setForm((f) => ({ ...f, salePrice: Math.round(suggested) }));
      lastComputedRef.current = Math.round(suggested);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.costPrice, additionalMarkup, additionalMarkupType, pricingConfig]);

  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      const extraMarkup = showAdditionalMarkup && additionalMarkup > 0
        ? { additionalMarkup, additionalMarkupType }
        : { additionalMarkup: null, additionalMarkupType: null };
      // 0 en el form significa "todavía no lo sé" — se manda undefined para
      // que el backend lo guarde como pendiente (null) y no como precio cero.
      const prices = {
        costPrice: form.costPrice > 0 ? form.costPrice : undefined,
        salePrice: form.salePrice > 0 ? form.salePrice : undefined,
      };
      if (initial) {
        return inventoryApi.updateProduct(initial.id, {
          ...form, ...prices, ...extraMarkup, kind,
          model: form.model || undefined, description: form.description || undefined,
        });
      }
      return inventoryApi.createProduct({
        ...form, ...prices, kind,
        ...(showAdditionalMarkup && additionalMarkup > 0 ? { additionalMarkup, additionalMarkupType } : {}),
        model: form.model || undefined, description: form.description || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      onOpenChange(false);
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al guardar'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 sm:max-w-2xl p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="flex-row items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle>{initial ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          <Button variant="ghost" size="icon-sm" type="button" onClick={() => onOpenChange(false)}>
            <X size={16} />
          </Button>
        </DialogHeader>

        {/* Body */}
        <form
          id="product-form"
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}
          className="flex flex-col gap-0"
        >
          <div className="max-h-[calc(90vh-130px)] overflow-y-auto px-6 py-5 space-y-5">

            {/* Clasificación */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Clasificación</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1 text-[12px]">Categoría *</Label>
                  <Select
                    value={form.categoryId || null}
                    onValueChange={(v) => set('categoryId', v ?? '')}
                  >
                    <SelectTrigger className="w-full">
                      <span className={cn('flex flex-1 text-left text-sm', !form.categoryId && 'text-muted-foreground')}>
                        {form.categoryId ? categories.find((c) => c.id === form.categoryId)?.name : '— Seleccionar —'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {categories.filter((c) => c.isActive).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 text-[12px]">Marca *</Label>
                  <Select
                    value={form.brandId || null}
                    onValueChange={(v) => set('brandId', v ?? '')}
                  >
                    <SelectTrigger className="w-full">
                      <span className={cn('flex flex-1 text-left text-sm', !form.brandId && 'text-muted-foreground')}>
                        {form.brandId ? brands.find((b) => b.id === form.brandId)?.name : '— Seleccionar —'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {brands.filter((b) => b.isActive).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Identificación */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Identificación</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1 text-[12px]">Nombre *</Label>
                  <Input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Heladera familiar" />
                </div>
                <div>
                  <Label className="mb-1 text-[12px]">Modelo</Label>
                  <Input value={form.model ?? ''} onChange={(e) => set('model', e.target.value)} placeholder="HRT-500" />
                </div>
              </div>
              <div className="mt-3">
                <Label className="mb-1 text-[12px]">Descripción</Label>
                <Textarea rows={2} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Detalles adicionales..." />
              </div>
            </div>

            {/* Tipo de producto — multi-rubro: define si se compra a un
                proveedor, si se fabrica, y si se vende en el mostrador. */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Tipo de producto</p>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(PRODUCT_KIND_LABEL) as ProductKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      'rounded-2xl border px-3 py-2 text-left text-[13px] font-medium transition-colors',
                      kind === k
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {PRODUCT_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">{PRODUCT_KIND_HINT[kind]}</p>
            </div>

            {/* Precios */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Precios</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1 text-[12px]">Precio costo (PYG)</Label>
                  <NumericInput
                    value={form.costPrice}
                    onChange={(v) => set('costPrice', v)}
                    className="h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  />
                </div>
                <div>
                  <Label className="mb-1 text-[12px]">
                    Precio venta (PYG)
                    {pricingConfig && form.costPrice > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const s = Math.round(computeSuggestedPrice(form.costPrice, pricingConfig, additionalMarkup, additionalMarkupType));
                          set('salePrice', s);
                          lastComputedRef.current = s;
                        }}
                        className="ml-2 text-[10px] font-normal text-primary underline"
                      >
                        recalcular
                      </button>
                    )}
                  </Label>
                  <NumericInput
                    value={form.salePrice}
                    onChange={(v) => { set('salePrice', v); lastComputedRef.current = -1; }}
                    className="h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  />
                </div>
              </div>

              {/* La ficha se puede guardar incompleta — lo que no se puede es
                  operar con ella. Se avisa acá, no al intentar guardar. */}
              {(form.costPrice <= 0 || form.salePrice <= 0 || !form.categoryId) && (
                <p className="mt-2 text-[12px] text-warn">
                  Sin precio de costo, precio de venta y categoría el producto queda en{' '}
                  <strong>Borrador</strong>: se guarda en el catálogo, pero no se puede vender ni comprar hasta completarlo.
                </p>
              )}

              {/* Desglose */}
              {pricingConfig && form.costPrice > 0 && (
                <div className="mt-3 rounded-2xl border border-border bg-muted/30 px-4 py-3 space-y-1.5">
                  <div className="flex justify-between text-[12px] text-muted-foreground">
                    <span>Costo</span>
                    <span className="font-mono tabular-nums">{fmtGs(form.costPrice)}</span>
                  </div>
                  <div className="flex justify-between text-[12px] text-muted-foreground">
                    <span>
                      Margen global&nbsp;
                      <span className="opacity-60">
                        ({pricingConfig.markupMethod === 'PERCENTAGE' ? `${pricingConfig.defaultMarkup}%` : `+Gs.`})
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-accent-on">
                      +{fmtGs(computeGlobalMarkupAmount(form.costPrice, pricingConfig))}
                    </span>
                  </div>
                  {showAdditionalMarkup && additionalMarkup > 0 && (
                    <div className="flex justify-between text-[12px] text-muted-foreground">
                      <span>
                        Recargo adicional&nbsp;
                        <span className="opacity-60">
                          ({additionalMarkupType === 'PERCENTAGE' ? `${additionalMarkup}%` : `+Gs.`})
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-amber-600">
                        +{fmtGs(computeAdditionalAmount(
                          pricingConfig.markupMethod === 'PERCENTAGE'
                            ? form.costPrice * (1 + pricingConfig.defaultMarkup / 100)
                            : form.costPrice + pricingConfig.defaultMarkup,
                          additionalMarkup, additionalMarkupType,
                        ))}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border pt-1.5 text-[12px] font-semibold text-foreground">
                    <span>Precio sugerido</span>
                    <span className="font-mono tabular-nums">
                      {fmtGs(Math.round(computeSuggestedPrice(form.costPrice, pricingConfig, additionalMarkup, additionalMarkupType)))}
                    </span>
                  </div>
                </div>
              )}

              {/* Recargo adicional */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowAdditionalMarkup((v) => !v)}
                  className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    size={13}
                    style={{ transform: showAdditionalMarkup ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                  />
                  Recargo adicional por producto <span className="opacity-60">(opcional)</span>
                </button>
                {showAdditionalMarkup && (
                  <div className="mt-2 rounded-2xl border border-border bg-muted/30 px-4 py-3">
                    <p className="mb-2 text-[11px] text-muted-foreground/70">
                      Se aplica sobre el precio base ya con margen global. Útil para productos con costo logístico inherente.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="mb-1 text-[12px]">Tipo</Label>
                        <div className="flex gap-2">
                          {(['PERCENTAGE', 'FIXED'] as MarkupType[]).map((t) => (
                            <label
                              key={t}
                              className={cn(
                                'flex flex-1 cursor-pointer items-center justify-center rounded-xl border px-2 py-1.5 text-[12px] font-medium transition-colors',
                                additionalMarkupType === t
                                  ? 'border-foreground bg-foreground text-background'
                                  : 'border-border text-muted-foreground hover:border-border-strong',
                              )}
                            >
                              <input type="radio" className="sr-only" checked={additionalMarkupType === t} onChange={() => setAdditionalMarkupType(t)} />
                              {t === 'PERCENTAGE' ? '% Porcentaje' : '+ Valor fijo'}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="mb-1 text-[12px]">Valor</Label>
                        <div className="relative">
                          <NumericInput
                            value={additionalMarkup}
                            onChange={setAdditionalMarkup}
                            decimals={additionalMarkupType === 'PERCENTAGE' ? 2 : 0}
                            placeholder="0"
                            className="h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 pr-8 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground/60">
                            {additionalMarkupType === 'PERCENTAGE' ? '%' : 'Gs.'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <label className="mt-3 flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={form.isSerialized}
                  onChange={(e) => set('isSerialized', e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-[13.5px] font-medium text-foreground">Producto serializado</span>
              </label>
              <p className="ml-[26px] mt-0.5 text-[12px] text-muted-foreground/70">
                Activar si cada unidad tiene número de serie (ej: electrodomésticos).
              </p>

              <label className="mt-3 flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={form.usesLots ?? false}
                  onChange={(e) => set('usesLots', e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-[13.5px] font-medium text-foreground">Maneja lotes</span>
              </label>
              <p className="ml-[26px] mt-0.5 text-[12px] text-muted-foreground/70">
                Activar para separar el stock por lote de ingreso (costo, fecha, vencimiento) —
                ej: alimentos, insumos con vencimiento, mercadería reposicionada por partidas.
              </p>
            </div>

            {error && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const router = useRouter();
  const [search, setSearch]               = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter]       = useState('');
  const [statusFilter, setStatusFilter]     = useState<ProductStatus | ''>('');
  const [showCreate, setShowCreate]         = useState(false);

  // Sin filtro de estado por defecto: un producto en Borrador tiene que ser
  // visible acá, si no queda inalcanzable justo en la pantalla donde se
  // completa. El que no quiera verlos filtra por estado explícitamente.
  const { data: products = [], isLoading } = useQuery<ProductWithStock[]>({
    queryKey: ['inventory-products', search, categoryFilter, brandFilter, statusFilter],
    queryFn: () => inventoryApi.listProductsWithStock({
      search: search || undefined,
      categoryId: categoryFilter || undefined,
      brandId: brandFilter || undefined,
      status: statusFilter || undefined,
    }),
  });
  const { data: categories = [] } = useQuery({ queryKey: ['inventory-categories'], queryFn: inventoryApi.listCategories });
  const { data: brands = [] }     = useQuery({ queryKey: ['inventory-brands'],     queryFn: inventoryApi.listBrands });

  const kpis = useMemo(() => {
    // Los productos sin precio (Borrador) no suman al valor de inventario —
    // no valen 0, simplemente todavía no se sabe cuánto valen.
    const valorInventario = products.reduce((s, p) => s + (p.salePrice ?? 0) * p.stock, 0);
    const criticos = products.filter((p) => p.stock > 0 && p.stock <= 3).length;
    const agotados  = products.filter((p) => p.stock === 0).length;
    const borradores = products.filter((p) => p.status === 'DRAFT').length;
    return { total: products.length, valorInventario, criticos, agotados, borradores };
  }, [products]);

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">Inventario</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">Gestión de productos y stock</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus size={15} />
          Nuevo producto
        </Button>
      </div>

      {/* KPI cards */}
      <div className={cn('mb-5 grid gap-4', kpis.borradores > 0 ? 'grid-cols-5' : 'grid-cols-4')}>
        <InventoryKpi label="Productos"          value={kpis.total} />
        <InventoryKpi label="Valor de inventario" value={fmtGs(kpis.valorInventario)} />
        <InventoryKpi label="Stock crítico"       value={kpis.criticos} danger={kpis.criticos > 0} />
        <InventoryKpi label="Agotados"            value={kpis.agotados}  danger={kpis.agotados > 0} />
        {/* Solo aparece si hay fichas a medio cargar — es una tarea pendiente,
            no un dato permanente del inventario. */}
        {kpis.borradores > 0 && (
          <InventoryKpi label="En borrador" value={kpis.borradores} />
        )}
      </div>

      {/* Tabs */}
      <InventoryNav active="products" />

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            className="pl-8"
            placeholder="Buscar por nombre o modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="shrink-0 text-muted-foreground/50" />
          <Select
            value={categoryFilter || null}
            onValueChange={(v) => setCategoryFilter(v === 'all' || v === null ? '' : v)}
          >
            <SelectTrigger className="w-48 overflow-hidden">
              <span className="min-w-0 flex-1 truncate text-left text-sm">
                {categoryFilter ? categories.find((c) => c.id === categoryFilter)?.name : 'Todas las categorías'}
              </span>
            </SelectTrigger>
            <SelectContent className="w-auto min-w-[12rem]">
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.filter((c) => c.isActive).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={brandFilter || null}
            onValueChange={(v) => setBrandFilter(v === 'all' || v === null ? '' : v)}
          >
            <SelectTrigger className="w-40 overflow-hidden">
              <span className="min-w-0 flex-1 truncate text-left text-sm">
                {brandFilter ? brands.find((b) => b.id === brandFilter)?.name : 'Todas las marcas'}
              </span>
            </SelectTrigger>
            <SelectContent className="w-auto min-w-[10rem]">
              <SelectItem value="all">Todas las marcas</SelectItem>
              {brands.filter((b) => b.isActive).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter || null}
            onValueChange={(v: string | null) =>
              setStatusFilter(v === 'all' || v === null ? '' : (v as ProductStatus))
            }
          >
            <SelectTrigger className="w-40 overflow-hidden">
              <span className="min-w-0 flex-1 truncate text-left text-sm">
                {statusFilter ? PRODUCT_STATUS_LABEL[statusFilter] : 'Todos los estados'}
              </span>
            </SelectTrigger>
            <SelectContent className="w-auto min-w-[10rem]">
              <SelectItem value="all">Todos los estados</SelectItem>
              {(Object.keys(PRODUCT_STATUS_LABEL) as ProductStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{PRODUCT_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-[13.5px] text-muted-foreground">Cargando productos...</div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[13.5px] text-muted-foreground">No se encontraron productos.</p>
          <Button variant="link" className="mt-2 text-accent-on" onClick={() => setShowCreate(true)}>
            Crear el primero
          </Button>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">Categoría</th>
                  <th className="px-4 py-3 text-left">Marca</th>
                  <th className="px-4 py-3 text-center">Stock</th>
                  <th className="px-4 py-3 text-right">P. Costo</th>
                  <th className="px-4 py-3 text-right">P. Venta</th>
                  <th className="px-4 py-3 text-right">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((product) => {
                  const m = markup(product);
                  return (
                    <tr
                      key={product.id}
                      onClick={() => router.push(`/dashboard/inventory/products/${product.id}`)}
                      className="cursor-pointer transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
                            <Package size={15} />
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-foreground">{product.name}</p>
                              <StatusBadge status={product.status} />
                              <KindBadge kind={product.kind} />
                            </div>
                            {product.model && <p className="font-mono text-[11.5px] text-muted-foreground">{product.model}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{product.category?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{product.brand?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-center"><StockBadge stock={product.stock} /></td>
                      <td className="px-4 py-3 text-right font-mono text-[12.5px] text-muted-foreground">
                        {product.costPrice == null ? <span className="text-warn">Pendiente</span> : fmtGs(product.costPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[12.5px] font-semibold text-foreground">
                        {product.salePrice == null ? <span className="font-normal text-warn">Pendiente</span> : fmtGs(product.salePrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-accent-on">
                        {m != null ? `${m.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ProductModal
        open={showCreate}
        onOpenChange={setShowCreate}
        categories={categories}
        brands={brands}
      />
    </div>
  );
}
