'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Building2, ChevronDown, Package, Plus,
  Star, Trash2, X,
} from 'lucide-react';
import { NumericInput } from '../../../../../../components/numeric-input';
import {
  inventoryApi,
  type MovementReason,
  type CreateStockMovementPayload,
  type UpdateProductPayload,
} from '../../../../../../lib/api/inventory';
import { procurementApi } from '../../../../../../lib/api/procurement';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────────────────

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';
const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

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
};

const MANUAL_REASONS: MovementReason[] = ['PURCHASE', 'CUSTOMER_RETURN', 'ADJUSTMENT', 'TRANSFER'];

type Tab = 'info' | 'movements' | 'suppliers' | 'units';

// ── Movement modal ─────────────────────────────────────────────────────────────

function MovementModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [dto, setDto] = useState<CreateStockMovementPayload>({
    reason: 'PURCHASE',
    quantity: 0,
    direction: 'IN',
    notes: '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.addStockMovement(productId, {
        ...dto,
        notes: dto.notes || undefined,
        warehouseId: dto.warehouseId || undefined,
        toWarehouseId: dto.toWarehouseId || undefined,
        direction: dto.reason === 'ADJUSTMENT' ? dto.direction : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-product', productId] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-product-movements', productId] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      onClose();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al registrar movimiento'));
    },
  });

  const set = <K extends keyof CreateStockMovementPayload>(k: K, v: CreateStockMovementPayload[K]) =>
    setDto((d) => ({ ...d, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">Registrar movimiento</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}
          className="px-6 py-5 space-y-4"
        >
          <div className="space-y-1.5">
            <Label>Motivo *</Label>
            <Select value={dto.reason} onValueChange={(v) => v && set('reason', v as MovementReason)}>
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">{REASON_LABELS[dto.reason as MovementReason] ?? dto.reason}</span>
              </SelectTrigger>
              <SelectContent>
                {MANUAL_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{REASON_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Cantidad *</Label>
              <NumericInput
                value={dto.quantity}
                onChange={(v) => set('quantity', Math.max(1, Math.round(v)))}
                className={NUM_CLS}
              />
            </div>

            {dto.reason === 'ADJUSTMENT' && (
              <div className="space-y-1.5">
                <Label>Dirección *</Label>
                <div className="flex gap-2">
                  {(['IN', 'OUT'] as const).map((d) => (
                    <label
                      key={d}
                      className={cn(
                        'flex-1 flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium cursor-pointer transition-colors',
                        dto.direction === d
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:border-border',
                      )}
                    >
                      <input type="radio" className="sr-only" checked={dto.direction === d} onChange={() => set('direction', d)} />
                      {d === 'IN' ? '+ Agregar' : '− Reducir'}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {dto.reason === 'TRANSFER' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Depósito origen</Label>
                <input className={NUM_CLS} placeholder="ID origen" value={dto.warehouseId ?? ''} onChange={(e) => set('warehouseId', e.target.value || undefined)} />
              </div>
              <div className="space-y-1.5">
                <Label>Depósito destino *</Label>
                <input className={NUM_CLS} placeholder="ID destino" value={dto.toWarehouseId ?? ''} onChange={(e) => set('toWarehouseId', e.target.value || undefined)} required />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Depósito (opcional)</Label>
              <input className={NUM_CLS} placeholder="ID del depósito" value={dto.warehouseId ?? ''} onChange={(e) => set('warehouseId', e.target.value || undefined)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <input className={NUM_CLS} placeholder="Ej: recepción factura #001" value={dto.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
          )}

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || dto.quantity < 1}>
              {mutation.isPending ? 'Registrando...' : 'Registrar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [showMovement, setShowMovement] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [serialInput, setSerialInput] = useState('');
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
    onSuccess: () => router.replace('/dashboard/inventory'),
  });

  const unitsMutation = useMutation({
    mutationFn: (serialNumbers: string[]) => inventoryApi.addProductUnits(id, serialNumbers),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-product-units', id] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-product', id] });
      setSerialInput('');
    },
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
  const editMutation = useMutation({
    mutationFn: () => inventoryApi.updateProduct(id, editForm),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-product', id] });
      setShowEdit(false);
    },
  });

  if (isLoading) {
    return <div className="py-20 text-center text-sm text-muted-foreground/60">Cargando producto...</div>;
  }

  if (!product) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground/60">Producto no encontrado.</p>
        <button onClick={() => router.replace('/dashboard/inventory')} className="mt-3 text-sm font-medium text-foreground underline underline-offset-2">
          Volver al inventario
        </button>
      </div>
    );
  }

  const m = product.costPrice > 0
    ? ((product.salePrice - product.costPrice) / product.costPrice) * 100
    : null;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info',      label: 'Información' },
    { key: 'movements', label: 'Movimientos' },
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
        Volver al inventario
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
            {!product.isActive && (
              <Badge variant="destructive" className="text-xs">Inactivo</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditForm({
                name: product.name,
                model: product.model ?? undefined,
                description: product.description ?? undefined,
                costPrice: product.costPrice,
                salePrice: product.salePrice,
              });
              setShowEdit(true);
            }}
          >
            Editar
          </Button>
          {activeTab === 'movements' && (
            <Button size="sm" onClick={() => setShowMovement(true)}>
              <Plus size={13} />
              Registrar
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {[
          {
            label: 'Stock',
            value: product.isSerialized ? `${product.stock} u.` : `${product.stock} ${product.unit}`,
            cls: product.stock === 0 ? 'text-destructive' : product.stock <= 3 ? 'text-warn' : 'text-foreground',
          },
          { label: 'Precio costo', value: fmtGs(product.costPrice), cls: 'text-foreground' },
          { label: 'Precio venta', value: fmtGs(product.salePrice), cls: 'text-foreground' },
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Precio costo (PYG) *</Label>
                  <NumericInput value={editForm.costPrice ?? 0} onChange={(v) => setEditForm((f) => ({ ...f, costPrice: v }))} className={NUM_CLS} />
                </div>
                <div className="space-y-1.5">
                  <Label>Precio venta (PYG) *</Label>
                  <NumericInput value={editForm.salePrice ?? 0} onChange={(v) => setEditForm((f) => ({ ...f, salePrice: v }))} className={NUM_CLS} />
                </div>
              </div>
              {editMutation.isError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">Error al guardar</div>
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
        </div>
      )}

      {/* ── Movimientos tab ──────────────────────────────────────────────────── */}
      {activeTab === 'movements' && (
        <div>
          {movements.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground/60">Sin movimientos registrados para este producto.</p>
              <button onClick={() => setShowMovement(true)} className="mt-3 text-sm font-medium text-foreground underline underline-offset-2">
                Registrar el primero
              </button>
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
                  {!ps.isPreferred && (
                    <button title="Marcar como principal" onClick={() => setPreferredMutation.mutate(ps.supplierId)} className="text-muted-foreground/60 hover:text-amber-500 transition-colors">
                      <Star size={14} />
                    </button>
                  )}
                  <button title="Quitar proveedor" onClick={() => removeSupplierMutation.mutate(ps.supplierId)} className="text-muted-foreground/60 hover:text-destructive transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {availableSuppliers.length > 0 && (
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
                    {u.status === 'IN_STOCK' ? 'En stock' : u.status === 'SOLD' ? 'Vendido' : 'Reservado'}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Ingresar números de serie <span className="font-normal text-muted-foreground/60">(uno por línea)</span>
            </p>
            <textarea
              rows={4}
              className={cn(TEXTAREA_CLS, 'font-mono')}
              placeholder={'SN-001\nSN-002\nSN-003'}
              value={serialInput}
              onChange={(e) => setSerialInput(e.target.value)}
            />
            {serialInput.trim() && (
              <p className="text-xs text-muted-foreground/60">
                {serialInput.split('\n').filter((s) => s.trim()).length} número(s) a registrar
              </p>
            )}
            {unitsMutation.isError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {(unitsMutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar unidades'}
              </div>
            )}
            <Button
              type="button"
              disabled={!serialInput.trim() || unitsMutation.isPending}
              onClick={() => {
                const sns = serialInput.split('\n').map((s) => s.trim()).filter(Boolean);
                unitsMutation.mutate(sns);
              }}
            >
              {unitsMutation.isPending ? 'Registrando...' : 'Registrar unidades'}
            </Button>
          </div>
        </div>
      )}

      {showMovement && <MovementModal productId={id} onClose={() => setShowMovement(false)} />}

      {activeTab === 'info' && !showEdit && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => {
              setEditForm({
                name: product.name,
                model: product.model ?? undefined,
                description: product.description ?? undefined,
                costPrice: product.costPrice,
                salePrice: product.salePrice,
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
