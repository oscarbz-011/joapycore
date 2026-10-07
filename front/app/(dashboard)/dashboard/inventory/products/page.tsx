'use client';

import { RequirePermission } from '@/components/require-permission';
import { SortableHeader } from '@/components/sortable-header';
import { useTableSort } from '@/lib/use-table-sort';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Package, Search, SlidersHorizontal, Plus, X, ChevronDown,
} from 'lucide-react';
import { NumericInput } from '../../../../../components/numeric-input';
import {
  inventoryApi,
  PRODUCT_KIND_HINT,
  PRODUCT_KIND_LABEL,
  PRODUCT_STATUS_LABEL,
  SALES_CHANNEL_LABEL,
  type Brand,
  type Category,
  type CreateProductPayload,
  type MarkupType,
  type OrderChannel,
  type Product,
  type ProductKind,
  type ProductStatus,
} from '../../../../../lib/api/inventory';
import {
  catalogKpis,
  defaultSalesChannels,
} from '../../../../../lib/product-catalog';
import { tenantsApi } from '../../../../../lib/api/tenants';
import { useActiveModules } from '../../../../../lib/use-active-modules';
import { settingsApi } from '../../../../../lib/api/settings';
import {
  computeAdditionalAmount,
  computeGlobalMarkupAmount,
  computeSuggestedPrice,
} from '../../../../../lib/pricing';
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

const PRODUCT_SORT = {
  name: (p: Product) => p.name,
  category: (p: Product) => p.category?.name,
  brand: (p: Product) => p.brand?.name,
  status: (p: Product) => PRODUCT_STATUS_LABEL[p.status],
  kind: (p: Product) => PRODUCT_KIND_LABEL[p.kind],
  purchasable: (p: Product) => p.isPurchasable,
  channels: (p: Product) => p.salesChannels.length,
  cost: (p: Product) => p.costPrice,
  sale: (p: Product) => p.salePrice,
  margin: (p: Product) => markup(p),
};

// ── Estado de la ficha ─────────────────────────────────────────────────────────

// El tipo y los flujos son dos ejes distintos: el tipo dice qué es el producto,
// los flags en qué circuitos participa. Cada canal se habilita por separado.
type ProductFlags = {
  isPurchasable: boolean;
  salesChannels: OrderChannel[];
};

const KIND_DEFAULT_FLAGS: Record<ProductKind, ProductFlags> = {
  RESALE: { isPurchasable: true, salesChannels: defaultSalesChannels('RESALE') },
  RAW_MATERIAL: {
    isPurchasable: true,
    salesChannels: defaultSalesChannels('RAW_MATERIAL'),
  },
  MANUFACTURED: {
    isPurchasable: false,
    salesChannels: defaultSalesChannels('MANUFACTURED'),
  },
};

const SALES_CHANNELS = Object.keys(SALES_CHANNEL_LABEL) as OrderChannel[];

function sameChannels(left: OrderChannel[], right: OrderChannel[]) {
  return (
    left.length === right.length &&
    left.every((channel) => right.includes(channel))
  );
}

function ProductFlagToggle({
  label, hint, checked, isDefault, onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  isDefault: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        <span className="text-[13.5px] font-medium text-foreground">{label}</span>
        {/* El desvío del default es la excepción deliberada, no un error: se
            marca para que se vea de un vistazo cuál de los dos lo tiene. */}
        {!isDefault && (
          <Badge variant="outline" className="text-[10.5px] font-normal">Distinto del default</Badge>
        )}
      </label>
      <p className="ml-[26px] mt-0.5 text-[12px] text-muted-foreground/70">{hint}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ProductStatus }) {
  if (status === 'ACTIVE') return <Badge variant="outline">Activo</Badge>;
  if (status === 'DRAFT')
    return <Badge className="bg-warn-subtle text-warn border-warn/30 hover:bg-warn-subtle">Borrador</Badge>;
  if (status === 'BLOCKED') return <Badge variant="destructive">Bloqueado</Badge>;
  return <Badge variant="secondary">Descontinuado</Badge>;
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
  // Sin el módulo de Producción, distinguir materia prima de fabricado no
  // significa nada: el negocio compra y vende, punto. Se oculta el selector y
  // todo producto nace RESALE (comprable y vendible), que es el comportamiento
  // que había antes de introducir ProductKind.
  const { hasModule } = useActiveModules();
  const showKindPicker = hasModule('production');

  // Derivado, no sincronizado: el estado guarda solo la elección explícita del
  // usuario y el default sale del rubro en cada render. Así no hace falta un
  // efecto ni un ref para "ya apliqué el default" (que además dependería de
  // cuándo llega la query del tenant).
  const [kindOverride, setKindOverride] = useState<ProductKind | null>(initial?.kind ?? null);
  const kind: ProductKind = !showKindPicker
    // Forzado, no solo escondido: una mueblería con el módulo apagado tomaría
    // MANUFACTURED por el default del rubro y crearía productos no comprables
    // sin que el usuario tenga dónde verlo ni corregirlo. Al editar se respeta
    // el tipo que la ficha ya tenga.
    ? (initial?.kind ?? 'RESALE')
    : (kindOverride ?? (tenant?.industry === 'MUEBLERIA' ? 'MANUFACTURED' : 'RESALE'));
  const setKind = setKindOverride;

  // Mismo criterio que el tipo: el estado guarda solo la desviación explícita y
  // el valor sale del tipo en cada render, así cambiar de tipo mueve los flags
  // solos. Al editar se siembra únicamente si la ficha ya se desviaba del
  // default de su tipo — si coincidía, seguir al tipo devuelve lo mismo y no se
  // congela un valor que el usuario nunca eligió.
  const [flagsOverride, setFlagsOverride] = useState<ProductFlags | null>(() => {
    if (!initial) return null;
    const base = KIND_DEFAULT_FLAGS[initial.kind];
    return initial.isPurchasable === base.isPurchasable &&
      sameChannels(initial.salesChannels, base.salesChannels)
      ? null
      : {
          isPurchasable: initial.isPurchasable,
          salesChannels: [...initial.salesChannels],
        };
  });
  const kindFlags = KIND_DEFAULT_FLAGS[kind];
  const flags = flagsOverride ?? kindFlags;
  const setPurchasable = (isPurchasable: boolean) =>
    setFlagsOverride({ ...flags, isPurchasable });
  const setSalesChannel = (channel: OrderChannel, enabled: boolean) =>
    setFlagsOverride({
      ...flags,
      salesChannels: enabled
        ? [...new Set([...flags.salesChannels, channel])]
        : flags.salesChannels.filter((current) => current !== channel),
    });

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
          ...form, ...prices, ...extraMarkup, kind, ...flags,
          model: form.model || undefined, description: form.description || undefined,
        });
      }
      return inventoryApi.createProduct({
        ...form, ...prices, kind, ...flags,
        ...(showAdditionalMarkup && additionalMarkup > 0 ? { additionalMarkup, additionalMarkupType } : {}),
        model: form.model || undefined, description: form.description || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al guardar'));
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

            {/* El tipo describe el origen del producto. Los canales se
                configuran aparte porque un mismo producto puede publicarse en
                uno o varios circuitos de venta. */}
            {showKindPicker && (
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
            )}

            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Disponibilidad comercial
              </p>
              <div className="space-y-3 rounded-2xl border border-border bg-muted/30 px-4 py-3">
                {showKindPicker && (
                <ProductFlagToggle
                  label="Se compra a proveedores"
                  hint="Aparece en órdenes de compra y recepciones de mercadería."
                  checked={flags.isPurchasable}
                  isDefault={flags.isPurchasable === kindFlags.isPurchasable}
                  onChange={setPurchasable}
                />
                )}
                <div>
                  <p className="mb-2 text-[12px] font-medium text-foreground">
                    Canales de venta
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {SALES_CHANNELS.map((channel) => (
                      <label
                        key={channel}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[12px]"
                      >
                        <input
                          type="checkbox"
                          checked={flags.salesChannels.includes(channel)}
                          onChange={(event) =>
                            setSalesChannel(channel, event.target.checked)
                          }
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        {SALES_CHANNEL_LABEL[channel]}
                      </label>
                    ))}
                  </div>
                  {!sameChannels(
                    flags.salesChannels,
                    kindFlags.salesChannels,
                  ) && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Canales distintos del valor inicial para este tipo de producto.
                    </p>
                  )}
                </div>
                {!flags.isPurchasable && flags.salesChannels.length === 0 && (
                  <p className="text-[12px] text-warn">
                    El producto no participa en compras ni en ningún canal de venta.
                  </p>
                )}
              </div>
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
  const [kindFilter, setKindFilter]         = useState<ProductKind | ''>('');
  const [showCreate, setShowCreate]         = useState(false);

  // Sin el módulo de Producción todos los productos son de reventa: filtrar por
  // tipo sería una opción muerta.
  const { hasModule } = useActiveModules();
  const showKindFilter = hasModule('production');

  // Sin filtro de estado por defecto: un producto en Borrador tiene que ser
  // visible acá, si no queda inalcanzable justo en la pantalla donde se
  // completa. El que no quiera verlos filtra por estado explícitamente.
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['inventory-products', search, categoryFilter, brandFilter, statusFilter, kindFilter],
    queryFn: () => inventoryApi.listProducts({
      search: search || undefined,
      categoryId: categoryFilter || undefined,
      brandId: brandFilter || undefined,
      status: statusFilter || undefined,
      kind: kindFilter || undefined,
    }),
  });
  const { data: categories = [] } = useQuery({ queryKey: ['inventory-categories'], queryFn: inventoryApi.listCategories });
  const { data: brands = [] }     = useQuery({ queryKey: ['inventory-brands'],     queryFn: inventoryApi.listBrands });

  const kpis = useMemo(() => catalogKpis(products), [products]);
  const { sorted, sort, toggle } = useTableSort(products, PRODUCT_SORT);

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">Productos</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Gestión del catálogo, estados y canales de venta
          </p>
        </div>
        <RequirePermission permission="inventory:products:create">
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus size={15} />
            Nuevo producto
          </Button>
        </RequirePermission>
      </div>

      {/* KPI cards */}
      <div className="mb-5 grid grid-cols-5 gap-4">
        <InventoryKpi label="Productos" value={kpis.total} />
        <InventoryKpi label="Activos" value={kpis.active} />
        <InventoryKpi label="En borrador" value={kpis.draft} />
        <InventoryKpi label="Descontinuados" value={kpis.inactive} />
        <InventoryKpi label="Bloqueados" value={kpis.blocked} danger={kpis.blocked > 0} />
      </div>

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
          {showKindFilter && (
            <Select
              value={kindFilter || null}
              onValueChange={(v: string | null) =>
                setKindFilter(v === 'all' || v === null ? '' : (v as ProductKind))
              }
            >
              <SelectTrigger className="w-40 overflow-hidden">
                <span className="min-w-0 flex-1 truncate text-left text-sm">
                  {kindFilter ? PRODUCT_KIND_LABEL[kindFilter] : 'Todos los tipos'}
                </span>
              </SelectTrigger>
              <SelectContent className="w-auto min-w-[10rem]">
                <SelectItem value="all">Todos los tipos</SelectItem>
                {(Object.keys(PRODUCT_KIND_LABEL) as ProductKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{PRODUCT_KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-[13.5px] text-muted-foreground">Cargando productos...</div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[13.5px] text-muted-foreground">No se encontraron productos.</p>
          <RequirePermission permission="inventory:products:create">
            <Button variant="link" className="mt-2 text-accent-on" onClick={() => setShowCreate(true)}>
              Crear el primero
            </Button>
          </RequirePermission>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <SortableHeader label="Producto" sortKey="name" sort={sort} onSort={toggle} />
                  <SortableHeader label="Categoría" sortKey="category" sort={sort} onSort={toggle} />
                  <SortableHeader label="Marca" sortKey="brand" sort={sort} onSort={toggle} />
                  <SortableHeader label="Estado" sortKey="status" sort={sort} onSort={toggle} />
                  <SortableHeader label="Tipo" sortKey="kind" sort={sort} onSort={toggle} />
                  <SortableHeader label="Compra" sortKey="purchasable" sort={sort} onSort={toggle} />
                  <SortableHeader label="Canales" sortKey="channels" sort={sort} onSort={toggle} />
                  <SortableHeader label="P. Costo" sortKey="cost" sort={sort} onSort={toggle} align="right" />
                  <SortableHeader label="P. Venta" sortKey="sale" sort={sort} onSort={toggle} align="right" />
                  <SortableHeader label="Margen" sortKey="margin" sort={sort} onSort={toggle} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((product) => {
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
                            </div>
                            {product.model && <p className="font-mono text-[11.5px] text-muted-foreground">{product.model}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{product.category?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{product.brand?.name ?? '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={product.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{PRODUCT_KIND_LABEL[product.kind]}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {product.isPurchasable ? 'Habilitado' : 'No'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {product.salesChannels.length > 0 ? (
                            product.salesChannels.map((channel) => (
                              <Badge key={channel} variant="outline" className="text-[10px]">
                                {SALES_CHANNEL_LABEL[channel]}
                              </Badge>
                            ))
                          ) : product.salesChannelsOnReceipt.length > 0 ? (
                            <span
                              className="text-warn"
                              title="Se habilita para la venta al recibir la primera mercadería"
                            >
                              Al recibir
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Sin canales</span>
                          )}
                        </div>
                      </td>
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
