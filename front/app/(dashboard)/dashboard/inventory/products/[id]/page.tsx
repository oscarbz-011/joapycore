'use client';

import { usePermission } from '@/lib/permissions';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Building2, ChevronDown, Package, Plus,
  Star, Trash2,
} from 'lucide-react';
import { NumericInput } from '../../../../../../components/numeric-input';
import {
  inventoryApi,
  SALES_CHANNEL_LABEL,
  type MovementReason,
  type OrderChannel,
  type ProductStatus,
  type UpdateProductPayload,
} from '../../../../../../lib/api/inventory';
import { procurementApi } from '../../../../../../lib/api/procurement';
import { settingsApi } from '../../../../../../lib/api/settings';
import { stockLevel } from '../../../../../../lib/inventory-stock';
import { computeSuggestedPrice } from '../../../../../../lib/pricing';
import { useActiveModules } from '../../../../../../lib/use-active-modules';
import { RecipeTab } from './recipe-tab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────────────────

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';
const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

const STOCK_LEVEL_CLS = {
  out: 'text-destructive',
  low: 'text-warn',
  ok: 'text-foreground',
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtGs(n: number) {
  return 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
}
function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

const REASON_LABELS: Record<MovementReason, string> = {
  PURCHASE:        'Ingreso de compra',
  CUSTOMER_RETURN: 'Devolución de cliente',
  ADJUSTMENT:      'Ajuste de inventario',
  TRANSFER:        'Transferencia',
  INITIAL:         'Stock inicial',
  SALE_OUT:        'Salida por venta',
  SALE_REVERSAL:   'Reversión de venta',
  PRODUCTION_IN:   'Ingreso por producción',
  PRODUCTION_OUT:  'Consumo en producción',
};

const SALES_CHANNELS = Object.keys(SALES_CHANNEL_LABEL) as OrderChannel[];

type Tab = 'info' | 'movements' | 'recipe' | 'suppliers' | 'units';

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Acciones visibles solo con el permiso que exige el backend para cada una.
  const canUpdate = usePermission('inventory:products:update');
  const canDelete = usePermission('inventory:products:delete');
  const [showEdit, setShowEdit] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierCostPrice, setSupplierCostPrice] = useState<number>(0);

  const { data: product, isLoading } = useQuery({
    queryKey: ['inventory-product', id],
    queryFn: () => inventoryApi.getProduct(id),
    enabled: !!id,
  });

  const { data: movements = [] } = useQuery({
    queryKey: ['inventory-product-movements', id],
    queryFn: () => inventoryApi.listMovements({ productId: id, take: 100 }),
    enabled: !!id && activeTab === 'movements',
  });

  const { data: units = [], isLoading: unitsLoading } = useQuery({
    queryKey: ['inventory-product-units', id],
    queryFn: () => inventoryApi.getProductUnits(id),
    enabled: !!id && !!product?.isSerialized && activeTab === 'units',
  });

  const { data: allSuppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: procurementApi.listSuppliers,
    enabled: activeTab === 'suppliers',
  });

  const { data: productSuppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ['product-suppliers', id],
    queryFn: () => inventoryApi.getProductSuppliers(id),
    enabled: !!id && activeTab === 'suppliers',
  });

  const deleteMutation = useMutation({
    mutationFn: () => inventoryApi.deleteProduct(id),
    onSuccess: () => router.replace('/dashboard/inventory/products'),
  });

  const addSupplierMutation = useMutation({
    mutationFn: () =>
      inventoryApi.addProductSupplier(id, {
        supplierId: selectedSupplierId,
        costPrice: supplierCostPrice > 0 ? supplierCostPrice : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['product-suppliers', id] });
      setSelectedSupplierId('');
      setSupplierCostPrice(0);
    },
  });

  const setPreferredMutation = useMutation({
    mutationFn: (supplierId: string) =>
      inventoryApi.updateProductSupplier(id, supplierId, { isPreferred: true }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['product-suppliers', id] }),
  });

  const removeSupplierMutation = useMutation({
    mutationFn: (supplierId: string) => inventoryApi.removeProductSupplier(id, supplierId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['product-suppliers', id] }),
  });

  const [editForm, setEditForm] = useState<UpdateProductPayload>({});

  // Mismo cálculo de precio sugerido que el modal de alta (lib/pricing.ts):
  // completar el costo de una ficha en borrador tiene que proponer el precio
  // de venta igual que al crearla, si no hay que sacar la cuenta a mano.
  const { data: pricingConfig } = useQuery({
    queryKey: ['pricing-config'],
    queryFn: settingsApi.getPricing,
  });
  // suggestedFor() es puro (se puede llamar durante el render, para el texto
  // del precio sugerido); suggestFrom() además recuerda lo último sugerido,
  // que es cómo se distingue un precio de venta escrito a mano de uno
  // calculado — solo se pisa el calculado.
  const lastSuggestedRef = useRef<number | undefined>(undefined);
  const suggestedFor = (cost: number) =>
    Math.round(
      computeSuggestedPrice(cost, pricingConfig, Number(product?.additionalMarkup ?? 0), product?.additionalMarkupType ?? null),
    );
  const suggestFrom = (cost: number) => {
    const s = suggestedFor(cost);
    lastSuggestedRef.current = s;
    return s;
  };
  const editMutation = useMutation({
    // Mismo criterio que el alta: 0 en el form es "sin cargar", y se manda
    // omitido — el backend valida `@IsPositive()`, así que enviar 0 daba
    // 400 "salePrice must be a positive number" al guardar una ficha a la
    // que todavía le falta el precio de venta.
    mutationFn: () => inventoryApi.updateProduct(id, {
      ...editForm,
      costPrice: editForm.costPrice ? editForm.costPrice : undefined,
      salePrice: editForm.salePrice ? editForm.salePrice : undefined,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-product', id] });
      // Precio y stock mínimo también se muestran en la vista de Stock.
      void queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      setShowEdit(false);
    },
  });

  const { hasModule } = useActiveModules();
  const [statusError, setStatusError] = useState('');
  const statusMutation = useMutation({
    mutationFn: (status: ProductStatus) => inventoryApi.updateProduct(id, { status }),
    onSuccess: () => {
      setStatusError('');
      void queryClient.invalidateQueries({ queryKey: ['inventory-product', id] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
    },
    // El backend revalida los requisitos aunque el botón esté deshabilitado
    // (la ficha pudo cambiar desde otra pestaña) — se muestra su mensaje.
    onError: (err: Error) => {
      setStatusError(apiErrorMessage(err, 'No se pudo cambiar el estado'));
    },
  });

  if (isLoading) {
    return <div className="py-20 text-center text-sm text-muted-foreground/60">Cargando producto...</div>;
  }

  if (!product) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground/60">Producto no encontrado.</p>
        <button onClick={() => router.replace('/dashboard/inventory/products')} className="mt-3 text-sm font-medium text-foreground underline underline-offset-2">
          Volver a productos
        </button>
      </div>
    );
  }

  const m = product.costPrice && product.salePrice && product.costPrice > 0
    ? ((product.salePrice - product.costPrice) / product.costPrice) * 100
    : null;

  // Mismo criterio que ProductsService.missingToActivate en el backend — acá
  // sirve para mostrar el checklist antes de intentar activar, allá para que
  // no entre nada incompleto aunque se llame directo a la API.
  const missingToActivate = [
    !product.costPrice || product.costPrice <= 0 ? 'precio de costo' : null,
    !product.salePrice || product.salePrice <= 0 ? 'precio de venta' : null,
    !product.category ? 'categoría' : null,
    !product.unit ? 'unidad de medida' : null,
  ].filter((x): x is string => x !== null);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info',      label: 'Información' },
    { key: 'movements', label: 'Movimientos' },
    // La receta solo tiene sentido en un producto fabricado y con el módulo de
    // Producción activo; sin él, sus endpoints devuelven 403 y la pestaña
    // quedaría rota.
    ...(product.kind === 'MANUFACTURED' && hasModule('production')
      ? [{ key: 'recipe' as Tab, label: 'Receta' }]
      : []),
    { key: 'suppliers', label: 'Proveedores' },
    ...(product.isSerialized ? [{ key: 'units' as Tab, label: 'Unidades' }] : []),
  ];

  const linkedSupplierIds = new Set(productSuppliers.map((ps) => ps.supplierId));
  const availableSuppliers = allSuppliers.filter((s) => s.isActive && !linkedSupplierIds.has(s.id));

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => router.back()}
        className="mb-5 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        Volver a productos
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/30 text-muted-foreground">
          <Package size={22} />
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{product.name}</h1>
          {product.model && <p className="font-mono text-sm text-muted-foreground/60 mt-0.5">{product.model}</p>}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {product.category && <span className="text-xs text-muted-foreground">{product.category.name}</span>}
            {product.brand && <span className="text-xs text-muted-foreground">· {product.brand.name}</span>}
            {product.status === 'DRAFT' && (
              <Badge className="bg-warn-subtle text-warn border-warn/30 hover:bg-warn-subtle text-xs">Borrador</Badge>
            )}
            {product.status === 'INACTIVE' && (
              <Badge variant="secondary" className="text-xs">Descontinuado</Badge>
            )}
            {product.status === 'BLOCKED' && (
              <Badge variant="destructive" className="text-xs">Bloqueado</Badge>
            )}
            {product.salesChannels.map((channel) => (
              <Badge key={channel} variant="outline" className="text-xs">
                {SALES_CHANNEL_LABEL[channel]}
              </Badge>
            ))}
            {product.salesChannelsOnReceipt.length > 0 && (
              <Badge className="bg-warn-subtle text-warn border-warn/30 hover:bg-warn-subtle text-xs">
                Venta al recibir la primera mercadería
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {canUpdate && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditForm({
                name: product.name,
                model: product.model ?? undefined,
                description: product.description ?? undefined,
                costPrice: product.costPrice ?? undefined,
                salePrice: product.salePrice ?? undefined,
                stockMin: product.stockMin,
                isPurchasable: product.isPurchasable,
                salesChannels: [...product.salesChannels],
              });
              setShowEdit(true);
            }}
          >
            Editar
          </Button>
          )}
          {canUpdate && product.status !== 'ACTIVE' && (
            <Button
              size="sm"
              disabled={missingToActivate.length > 0 || statusMutation.isPending}
              onClick={() => statusMutation.mutate('ACTIVE')}
            >
              Activar
            </Button>
          )}
          {canUpdate && product.status === 'ACTIVE' && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate('INACTIVE')}
              >
                Descontinuar
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate('BLOCKED')}
              >
                Bloquear
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Qué falta para poder operar con esta ficha. Se muestra el checklist
          completo en vez de un "faltan datos" genérico. */}
      {product.status !== 'ACTIVE' && (
        <div className="mb-5 rounded-xl border border-warn/30 bg-warn-subtle px-4 py-3">
          <p className="text-[13px] font-semibold text-warn">
            {product.status === 'DRAFT' && 'Este producto está en borrador: no se puede vender ni comprar.'}
            {product.status === 'INACTIVE' && 'Este producto está descontinuado: no entra en ventas ni compras nuevas.'}
            {product.status === 'BLOCKED' && 'Este producto está bloqueado: no entra en ventas ni compras nuevas.'}
          </p>
          {missingToActivate.length > 0 ? (
            <p className="mt-1 text-[12.5px] text-warn/80">
              Para activarlo falta cargar: {missingToActivate.join(', ')}.
            </p>
          ) : (
            <p className="mt-1 text-[12.5px] text-warn/80">
              La ficha está completa — se puede activar.
            </p>
          )}
          {statusError && <p className="mt-1 text-[12.5px] text-destructive">{statusError}</p>}
        </div>
      )}

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {[
          {
            label: 'Stock',
            value: product.isSerialized ? `${product.stock} u.` : `${product.stock} ${product.unit}`,
            cls: STOCK_LEVEL_CLS[stockLevel(product.stock, product.stockMin)],
          },
          { label: 'Precio costo', value: product.costPrice == null ? 'Pendiente' : fmtGs(product.costPrice), cls: product.costPrice == null ? 'text-warn' : 'text-foreground' },
          { label: 'Precio venta', value: product.salePrice == null ? 'Pendiente' : fmtGs(product.salePrice), cls: product.salePrice == null ? 'text-warn' : 'text-foreground' },
          { label: 'Margen', value: m != null ? `${m.toFixed(1)}%` : '—', cls: 'text-accent-on' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border border-border bg-card px-3.5 py-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className={cn('mt-0.5 text-lg font-bold tabular-nums', cls)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-5">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Información tab ──────────────────────────────────────────────────── */}
      {activeTab === 'info' && (
        <div className="space-y-4">
          {showEdit ? (
            <form
              onSubmit={(e) => { e.preventDefault(); editMutation.mutate(); }}
              className="rounded-xl border border-border bg-card p-5 space-y-4"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Editar información</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nombre *</Label>
                  <Input value={editForm.name ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Modelo</Label>
                  <Input value={editForm.model ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value || undefined }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Descripción</Label>
                <textarea
                  className={TEXTAREA_CLS}
                  rows={2}
                  value={editForm.description ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value || undefined }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Canales de venta</Label>
                <div className="grid grid-cols-3 gap-2">
                  {SALES_CHANNELS.map((channel) => {
                    const selected = editForm.salesChannels ?? [];
                    return (
                      <label
                        key={channel}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(channel)}
                          onChange={(event) =>
                            setEditForm((form) => ({
                              ...form,
                              salesChannels: event.target.checked
                                ? [...new Set([...(form.salesChannels ?? []), channel])]
                                : (form.salesChannels ?? []).filter(
                                    (current) => current !== channel,
                                  ),
                            }))
                          }
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        {SALES_CHANNEL_LABEL[channel]}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Precio costo (PYG)</Label>
                  <NumericInput
                    value={editForm.costPrice ?? 0}
                    onChange={(v) => setEditForm((f) => ({
                      ...f,
                      costPrice: v,
                      // Mismo criterio que el modal de alta: se sugiere el
                      // precio de venta mientras no haya uno propio escrito a
                      // mano — si el usuario ya lo tocó, no se le pisa.
                      salePrice: !f.salePrice || f.salePrice === lastSuggestedRef.current
                        ? suggestFrom(v)
                        : f.salePrice,
                    }))}
                    className={NUM_CLS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Precio venta (PYG)
                    {pricingConfig && (editForm.costPrice ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => setEditForm((f) => ({ ...f, salePrice: suggestFrom(f.costPrice ?? 0) }))}
                        className="ml-2 text-[10px] font-normal text-primary underline"
                      >
                        recalcular
                      </button>
                    )}
                  </Label>
                  <NumericInput value={editForm.salePrice ?? 0} onChange={(v) => setEditForm((f) => ({ ...f, salePrice: v }))} className={NUM_CLS} />
                </div>
              </div>
              {pricingConfig && (editForm.costPrice ?? 0) > 0 && (
                <p className="text-[12px] text-muted-foreground">
                  Precio sugerido con el margen configurado ({pricingConfig.markupMethod === 'PERCENTAGE'
                    ? `${pricingConfig.defaultMarkup}%`
                    : fmtGs(pricingConfig.defaultMarkup)}):{' '}
                  <span className="font-mono tabular-nums text-foreground">{fmtGs(suggestedFor(editForm.costPrice ?? 0))}</span>
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="product-stock-min">Stock mínimo</Label>
                  <NumericInput
                    id="product-stock-min"
                    value={editForm.stockMin ?? 0}
                    onChange={(v) => setEditForm((f) => ({ ...f, stockMin: Math.max(0, Math.round(v)) }))}
                    className={NUM_CLS}
                  />
                  <p className="text-[12px] text-muted-foreground">
                    Al llegar a esta cantidad el producto se marca para reposición en Stock. Vacío = sin mínimo.
                  </p>
                </div>
              </div>
              {editMutation.isError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {/* El mensaje del backend dice qué campo rechazó; un
                      "Error al guardar" genérico obliga a abrir la consola. */}
                  {apiErrorMessage(editMutation.error, 'Error al guardar')}
                </div>
              )}
              <div className="flex gap-3">
                <Button type="submit" disabled={editMutation.isPending}>
                  {editMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowEdit(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {[
                { label: 'Nombre',      value: product.name },
                { label: 'Modelo',      value: product.model ?? '—' },
                { label: 'Descripción', value: product.description ?? '—' },
                { label: 'Categoría',   value: product.category?.name ?? '—' },
                { label: 'Marca',       value: product.brand?.name ?? '—' },
                { label: 'Unidad',      value: product.unit },
                { label: 'Tipo',        value: product.isSerialized ? 'Serializado (por N/S)' : 'Por cantidad' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-baseline justify-between px-5 py-3">
                  <span className="text-xs text-muted-foreground w-32 shrink-0">{label}</span>
                  <span className="text-sm text-foreground text-right">{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Danger zone */}
          {canDelete && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-destructive mb-3">Zona de peligro</p>
            {!confirmDelete ? (
              <Button
                type="button"
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
              >
                Eliminar producto
              </Button>
            ) : (
              <div>
                <p className="text-sm text-destructive mb-3">¿Confirmar la eliminación? Esta acción no se puede deshacer.</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* ── Movimientos tab ──────────────────────────────────────────────────── */}
      {activeTab === 'movements' && (
        <div>
          {movements.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground/60">Sin movimientos registrados para este producto.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Fecha</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Motivo</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Cantidad</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Depósito</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Notas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {movements.map((mv) => (
                      <tr key={mv.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{fmtDate(mv.createdAt)}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {mv.reason ? REASON_LABELS[mv.reason] : mv.type}
                          </span>
                        </td>
                        <td className={cn('px-4 py-3 text-right font-mono font-bold tabular-nums', mv.quantity > 0 ? 'text-emerald-600' : 'text-destructive')}>
                          {mv.quantity > 0 ? `+${mv.quantity}` : String(mv.quantity)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{mv.warehouse?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">{mv.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Receta tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'recipe' && (
        <RecipeTab productId={id} unit={product.unit} />
      )}

      {/* ── Proveedores tab ──────────────────────────────────────────────────── */}
      {activeTab === 'suppliers' && (
        <div className="space-y-4">
          {suppliersLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/30" />)}
            </div>
          ) : productSuppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin proveedores asociados.</p>
          ) : (
            <div className="space-y-2">
              {productSuppliers.map((ps) => (
                <div key={ps.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                  <Building2 size={15} className="shrink-0 text-muted-foreground/60" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{ps.supplier.name}</p>
                    {ps.costPrice != null && <p className="text-xs text-muted-foreground">{fmtGs(Number(ps.costPrice))}</p>}
                  </div>
                  {ps.isPreferred && (
                    <Badge variant="outline" className="bg-accent-subtle text-accent-on border-accent-on/20">Principal</Badge>
                  )}
                  {canUpdate && !ps.isPreferred && (
                    <button title="Marcar como principal" onClick={() => setPreferredMutation.mutate(ps.supplierId)} className="text-muted-foreground/60 hover:text-amber-500 transition-colors">
                      <Star size={14} />
                    </button>
                  )}
                  {canDelete && (
                  <button title="Quitar proveedor" onClick={() => removeSupplierMutation.mutate(ps.supplierId)} className="text-muted-foreground/60 hover:text-destructive transition-colors">
                    <Trash2 size={14} />
                  </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canUpdate && availableSuppliers.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">Agregar proveedor</p>
              <div className="flex gap-2">
                <Select value={selectedSupplierId || 'none'} onValueChange={(v) => setSelectedSupplierId(v && v !== 'none' ? v : '')}>
                  <SelectTrigger className="flex-1">
                    <span className="flex-1 text-left text-sm truncate">{availableSuppliers.find((s) => s.id === selectedSupplierId)?.name ?? 'Seleccionar proveedor…'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Seleccionar proveedor…</SelectItem>
                    {availableSuppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <NumericInput
                  value={supplierCostPrice}
                  onChange={setSupplierCostPrice}
                  placeholder="0"
                  className={cn(NUM_CLS, 'w-28')}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedSupplierId || addSupplierMutation.isPending}
                onClick={() => addSupplierMutation.mutate()}
              >
                <Plus size={13} />
                {addSupplierMutation.isPending ? 'Agregando…' : 'Agregar proveedor'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Unidades tab (serialized) ────────────────────────────────────────── */}
      {activeTab === 'units' && product.isSerialized && (
        <div className="space-y-4">
          {unitsLoading ? (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-muted/30" />)}
            </div>
          ) : units.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin unidades registradas aún.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
              {units.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-mono text-sm text-foreground">{u.serialNumber}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      u.status === 'IN_STOCK'  ? 'bg-accent-subtle text-accent-on border-accent-on/20' :
                      u.status === 'SOLD'      ? 'bg-muted/30 text-muted-foreground border-border' :
                                                 'bg-warn-subtle text-warn border-warn/30',
                    )}
                  >
                    {u.status === 'IN_STOCK'
                      ? 'En stock'
                      : u.status === 'SOLD'
                        ? 'Vendido'
                        : u.status === 'ADJUSTED_OUT'
                          ? 'Ajustado'
                          : u.status === 'DAMAGED'
                            ? 'Dañado'
                            : 'Reservado'}
                  </Badge>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {canUpdate && activeTab === 'info' && !showEdit && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => {
              setEditForm({
                name: product.name,
                model: product.model ?? undefined,
                description: product.description ?? undefined,
                costPrice: product.costPrice ?? undefined,
                salePrice: product.salePrice ?? undefined,
                stockMin: product.stockMin,
              });
              setShowEdit(true);
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown size={13} />
            Editar información del producto
          </button>
        </div>
      )}
    </div>
  );
}
