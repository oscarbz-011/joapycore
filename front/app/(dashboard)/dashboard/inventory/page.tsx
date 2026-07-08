'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Settings, Search, SlidersHorizontal, Plus, X, ArrowDownToLine, ArrowUpFromLine, RotateCcw, Star, Trash2, Building2 } from 'lucide-react';
import {
  inventoryApi,
  type Brand,
  type Category,
  type CreateProductPayload,
  type Product,
  type ProductWithStock,
} from '../../../../lib/api/inventory';
import { procurementApi } from '../../../../lib/api/procurement';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtGs(n: number) {
  return 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
}
function fmtGsShort(n: number) {
  if (n >= 1_000_000) return `Gs. ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `Gs. ${Math.round(n / 1_000)}k`;
  return `Gs. ${Math.round(n)}`;
}
function markup(p: Product) {
  if (p.costPrice <= 0) return null;
  return ((p.salePrice - p.costPrice) / p.costPrice) * 100;
}

// ── Stock badge ────────────────────────────────────────────────────────────────

function StockBadge({ stock }: { stock: number }) {
  if (stock === 0)
    return (
      <span className="rounded-[7px] bg-danger-subtle px-[9px] py-[3px] text-[12px] font-bold text-danger">
        Agotado
      </span>
    );
  if (stock <= 3)
    return (
      <span className="rounded-[7px] bg-warn-subtle px-[9px] py-[3px] text-[12px] font-bold text-warn">
        {stock} u.
      </span>
    );
  return (
    <span className="rounded-[7px] bg-accent-subtle px-[9px] py-[3px] text-[12px] font-bold text-accent-on">
      {stock} u.
    </span>
  );
}

// ── KPI mini-card ──────────────────────────────────────────────────────────────

function InventoryKpi({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className="rounded-[14px] border border-border bg-surface p-[14px_16px] shadow-[var(--shadow-sm)]">
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
      <p className={`mt-[2px] text-[22px] font-extrabold tabular-nums ${danger ? 'text-danger' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  );
}

// ── Tab nav ────────────────────────────────────────────────────────────────────

function InventoryNav({ active }: { active: 'products' | 'config' }) {
  const items = [
    { key: 'products' as const, label: 'Productos',      href: '/dashboard/inventory',        icon: Package },
    { key: 'config'   as const, label: 'Configuración',  href: '/dashboard/inventory/config', icon: Settings },
  ];
  return (
    <div className="flex border-b border-border mb-5">
      {items.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          className={`flex items-center gap-1.5 px-[14px] py-[10px] text-[13.5px] font-medium border-b-2 -mb-px transition-colors ${
            active === key
              ? 'border-accent text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Icon size={14} />
          {label}
        </Link>
      ))}
    </div>
  );
}

// ── Product modal (create / edit) ──────────────────────────────────────────────

const EMPTY_FORM: CreateProductPayload = {
  categoryId: '', brandId: '', name: '', model: '', description: '',
  isSerialized: false, unit: 'unidad', costPrice: 0, salePrice: 0,
};

function ProductModal({
  categories, brands, initial, onClose, onSaved,
}: {
  categories: Category[];
  brands: Brand[];
  initial?: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateProductPayload>(
    initial
      ? { categoryId: initial.category?.id ?? '', brandId: initial.brand?.id ?? '', name: initial.name,
          model: initial.model ?? '', description: initial.description ?? '', isSerialized: initial.isSerialized,
          unit: initial.unit, costPrice: initial.costPrice, salePrice: initial.salePrice }
      : EMPTY_FORM,
  );
  const [initialStock, setInitialStock] = useState(0);
  const [error, setError] = useState('');

  const set = <K extends keyof CreateProductPayload>(k: K, v: CreateProductPayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      if (initial) {
        return inventoryApi.updateProduct(initial.id, {
          ...form,
          model: form.model || undefined,
          description: form.description || undefined,
        });
      }
      const product = await inventoryApi.createProduct({
        ...form,
        model: form.model || undefined,
        description: form.description || undefined,
      });
      if (initialStock > 0 && !form.isSerialized) {
        await inventoryApi.addStockMovement(product.id, {
          type: 'IN',
          quantity: initialStock,
          notes: 'Stock inicial',
        });
      }
      return product;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      onSaved();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al guardar'));
    },
  });

  const inp = 'w-full rounded-[9px] border border-border bg-surface text-ink px-3 py-2 text-[13.5px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent bg-surface';
  const lbl = 'block text-[12px] font-medium text-muted mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[18px] bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-[15px] font-bold text-ink">{initial ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button onClick={onClose} className="rounded-[8px] p-1.5 text-muted hover:bg-surface-2">
            <X size={17} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }} className="px-6 py-5 space-y-5">
          {/* Clasificación */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-faint">Clasificación</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Categoría *</label>
                <select className={inp} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} required>
                  <option value="">— Seleccionar —</option>
                  {categories.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Marca *</label>
                <select className={inp} value={form.brandId} onChange={(e) => set('brandId', e.target.value)} required>
                  <option value="">— Seleccionar —</option>
                  {brands.filter((b) => b.isActive).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Identificación */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-faint">Identificación</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Nombre *</label>
                <input className={inp} value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Heladera familiar" />
              </div>
              <div>
                <label className={lbl}>Modelo</label>
                <input className={inp} value={form.model ?? ''} onChange={(e) => set('model', e.target.value)} placeholder="HRT-500" />
              </div>
            </div>
            <div className="mt-3">
              <label className={lbl}>Descripción</label>
              <textarea className={`${inp} resize-none`} rows={2} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Detalles adicionales..." />
            </div>
          </div>

          {/* Precios y tipo */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-faint">Precios y tipo</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Precio costo (PYG) *</label>
                <input type="number" min={0} className={inp} value={form.costPrice || ''} onChange={(e) => set('costPrice', parseFloat(e.target.value) || 0)} required />
              </div>
              <div>
                <label className={lbl}>Precio venta (PYG) *</label>
                <input type="number" min={0} className={inp} value={form.salePrice || ''} onChange={(e) => set('salePrice', parseFloat(e.target.value) || 0)} required />
              </div>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2.5">
              <input type="checkbox" checked={form.isSerialized} onChange={(e) => set('isSerialized', e.target.checked)} className="h-4 w-4 accent-accent rounded border-border" />
              <span className="text-[13.5px] font-medium text-ink">Producto serializado</span>
            </label>
            <p className="ml-[26px] mt-0.5 text-[12px] text-faint">Activar si cada unidad tiene número de serie (ej: electrodomésticos).</p>
          </div>

          {/* Stock inicial (solo al crear) */}
          {!initial && (
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-faint">Stock inicial</p>
              {form.isSerialized ? (
                <div className="rounded-[9px] border border-border bg-surface-2 px-4 py-3 text-[13px] text-muted">
                  Los productos serializados agregan stock mediante números de serie desde el detalle del producto.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Cantidad inicial</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className={inp}
                      value={initialStock || ''}
                      placeholder="0"
                      onChange={(e) => setInitialStock(parseInt(e.target.value) || 0)}
                    />
                    <p className="mt-1 text-[11.5px] text-faint">Dejá en 0 si no tenés stock aún. Podés ajustarlo después.</p>
                  </div>
                  {initialStock > 0 && (
                    <div className="flex items-end pb-[2px]">
                      <div className="rounded-[9px] border border-accent-subtle bg-accent-subtle px-4 py-3 text-[13px] text-accent-on">
                        Se registrará un movimiento <strong>IN</strong> de <strong>{initialStock} {form.unit || 'unidad'}{initialStock !== 1 ? 'es' : ''}</strong>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-[9px] border border-danger-subtle bg-danger-subtle px-4 py-3 text-[13px] text-danger">{error}</div>
          )}

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button type="button" onClick={onClose} className="rounded-[9px] border border-border px-4 py-2 text-[13.5px] text-ink hover:bg-surface-2">Cancelar</button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-[9px] px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {mutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Product detail panel ───────────────────────────────────────────────────────

function ProductDetailPanel({
  product, categories, brands, onClose,
}: {
  product: ProductWithStock;
  categories: Category[];
  brands: Brand[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [movType, setMovType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('IN');
  const [movQty, setMovQty] = useState<number | ''>('');
  const [movNotes, setMovNotes] = useState('');
  const [movSuccess, setMovSuccess] = useState(false);
  const [serialInput, setSerialInput] = useState('');
  const [unitsSuccess, setUnitsSuccess] = useState(false);
  const [specs, setSpecs] = useState({
    unit:     product.unit,
    weightKg: product.weightKg ?? '',
    heightCm: product.heightCm ?? '',
    widthCm:  product.widthCm  ?? '',
    depthCm:  product.depthCm  ?? '',
  });
  const [specsSuccess, setSpecsSuccess] = useState(false);

  const specsMutation = useMutation({
    mutationFn: () =>
      inventoryApi.updateProduct(product.id, {
        unit:     specs.unit || 'unidad',
        weightKg: specs.weightKg === '' ? null : Number(specs.weightKg),
        heightCm: specs.heightCm === '' ? null : Number(specs.heightCm),
        widthCm:  specs.widthCm  === '' ? null : Number(specs.widthCm),
        depthCm:  specs.depthCm  === '' ? null : Number(specs.depthCm),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-product', product.id] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      setSpecsSuccess(true);
      setTimeout(() => setSpecsSuccess(false), 2500);
    },
  });

  const { data: detail, isLoading } = useQuery<ProductWithStock>({
    queryKey: ['inventory-product', product.id],
    queryFn: () => inventoryApi.getProduct(product.id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => inventoryApi.deleteProduct(product.id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['inventory-products'] }); onClose(); },
  });

  const stockMutation = useMutation({
    mutationFn: () =>
      inventoryApi.addStockMovement(product.id, {
        type: movType,
        quantity: Number(movQty),
        notes: movNotes || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-product', product.id] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      setMovQty('');
      setMovNotes('');
      setMovSuccess(true);
      setTimeout(() => setMovSuccess(false), 2500);
    },
  });

  const { data: units = [], isLoading: unitsLoading } = useQuery({
    queryKey: ['inventory-product-units', product.id],
    queryFn: () => inventoryApi.getProductUnits(product.id),
    enabled: product.isSerialized,
  });

  const unitsMutation = useMutation({
    mutationFn: (serialNumbers: string[]) => inventoryApi.addProductUnits(product.id, serialNumbers),
    onSuccess: ({ created }) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-product-units', product.id] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-product', product.id] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      setSerialInput('');
      setUnitsSuccess(true);
      setTimeout(() => setUnitsSuccess(false), 3000);
      return created;
    },
  });

  // Suppliers
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierCostPrice, setSupplierCostPrice] = useState('');

  const { data: allSuppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: procurementApi.listSuppliers,
  });

  const { data: productSuppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ['product-suppliers', product.id],
    queryFn: () => inventoryApi.getProductSuppliers(product.id),
  });

  const linkedSupplierIds = new Set(productSuppliers.map((ps) => ps.supplierId));
  const availableSuppliers = allSuppliers.filter((s) => s.isActive && !linkedSupplierIds.has(s.id));

  const addSupplierMutation = useMutation({
    mutationFn: () =>
      inventoryApi.addProductSupplier(product.id, {
        supplierId: selectedSupplierId,
        costPrice: supplierCostPrice ? Number(supplierCostPrice) : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['product-suppliers', product.id] });
      setSelectedSupplierId('');
      setSupplierCostPrice('');
    },
  });

  const setPreferredMutation = useMutation({
    mutationFn: (supplierId: string) =>
      inventoryApi.updateProductSupplier(product.id, supplierId, { isPreferred: true }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['product-suppliers', product.id] }),
  });

  const removeSupplierMutation = useMutation({
    mutationFn: (supplierId: string) =>
      inventoryApi.removeProductSupplier(product.id, supplierId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['product-suppliers', product.id] }),
  });

  const m = markup(product);

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <aside className="relative z-50 flex h-full w-full max-w-sm flex-col bg-surface shadow-[var(--shadow-lg)] overflow-y-auto">
          <div className="flex items-start justify-between border-b border-border px-5 py-4">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-ink truncate">{product.name}</p>
              {product.model && <p className="font-mono text-[12px] text-faint mt-0.5">{product.model}</p>}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {product.category && <span className="text-[12px] text-muted">{product.category.name}</span>}
                {product.brand && <span className="text-[12px] text-muted">· {product.brand.name}</span>}
              </div>
            </div>
            <button onClick={onClose} className="ml-3 shrink-0 rounded-[8px] p-1.5 text-muted hover:bg-surface-2"><X size={17} /></button>
          </div>

          {/* Stock */}
          <div className="border-b border-border px-5 py-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Stock actual</p>
            {isLoading ? (
              <div className="h-8 w-20 animate-pulse rounded-md bg-border" />
            ) : (
              <div className="flex items-baseline gap-2">
                <p className={`text-[28px] font-extrabold ${(detail?.stock ?? 0) === 0 ? 'text-danger' : (detail?.stock ?? 0) <= 3 ? 'text-warn' : 'text-ink'}`}>
                  {detail?.stock ?? 0}
                </p>
                <p className="text-[14px] text-muted">{product.unit}</p>
              </div>
            )}
          </div>

          {/* Precios */}
          <div className="border-b border-border px-5 py-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-faint">Precios</p>
            <div className="space-y-2">
              <div className="flex justify-between text-[13.5px]">
                <span className="text-muted">Costo</span>
                <span className="font-medium text-ink">{fmtGs(product.costPrice)}</span>
              </div>
              <div className="flex justify-between text-[13.5px]">
                <span className="text-muted">Venta</span>
                <span className="font-bold text-ink">{fmtGs(product.salePrice)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-[13.5px]">
                <span className="text-muted">Margen</span>
                <span className="font-bold text-accent-on">{m != null ? `${m.toFixed(1)}%` : '—'}</span>
              </div>
            </div>
          </div>

          {/* Stock management — bifurca según tipo de producto */}
          {product.isSerialized ? (
            <div className="border-b border-border px-5 py-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-faint">Unidades serializadas</p>

              {/* Units list */}
              {unitsLoading ? (
                <div className="space-y-1.5 mb-4">
                  {[1,2,3].map((i) => <div key={i} className="h-8 animate-pulse rounded-md bg-border" />)}
                </div>
              ) : units.length > 0 ? (
                <div className="mb-4 max-h-[180px] overflow-y-auto rounded-[9px] border border-border divide-y divide-border">
                  {units.map((u) => (
                    <div key={u.id} className="flex items-center justify-between px-3 py-2">
                      <span className="font-mono text-[12.5px] text-ink">{u.serialNumber}</span>
                      <span className={`rounded-[6px] px-2 py-0.5 text-[11px] font-bold ${
                        u.status === 'IN_STOCK'  ? 'bg-accent-subtle text-accent-on' :
                        u.status === 'SOLD'      ? 'bg-surface-2 text-muted' :
                                                   'bg-warn-subtle text-warn'
                      }`}>
                        {u.status === 'IN_STOCK' ? 'En stock' : u.status === 'SOLD' ? 'Vendido' : 'Reservado'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-4 text-[13px] text-muted">Sin unidades registradas aún.</p>
              )}

              {/* Add serial numbers */}
              <div className="mb-3">
                <label className="mb-1 block text-[12.5px] font-medium text-muted">
                  Ingresar números de serie <span className="font-normal text-faint">(uno por línea)</span>
                </label>
                <textarea
                  rows={4}
                  className="w-full resize-none rounded-[9px] border border-border bg-surface px-3 py-2 font-mono text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder={'SN-001\nSN-002\nSN-003'}
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                />
                {serialInput.trim() && (
                  <p className="mt-1 text-[11.5px] text-faint">
                    {serialInput.split('\n').filter((s) => s.trim()).length} número(s) a registrar
                  </p>
                )}
              </div>

              {unitsMutation.isError && (
                <p className="mb-2 rounded-[8px] border border-danger-subtle bg-danger-subtle px-3 py-2 text-[12.5px] text-danger">
                  {(unitsMutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar unidades'}
                </p>
              )}
              {unitsSuccess && (
                <p className="mb-2 rounded-[8px] border border-accent-subtle bg-accent-subtle px-3 py-2 text-[12.5px] text-accent-on">
                  Unidades registradas correctamente
                </p>
              )}

              <button
                type="button"
                disabled={!serialInput.trim() || unitsMutation.isPending}
                onClick={() => {
                  const sns = serialInput.split('\n').map((s) => s.trim()).filter(Boolean);
                  unitsMutation.mutate(sns);
                }}
                className="w-full rounded-[9px] py-2 text-[13.5px] font-semibold text-white disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {unitsMutation.isPending ? 'Registrando...' : 'Registrar unidades'}
              </button>
            </div>
          ) : (
            <div className="border-b border-border px-5 py-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-faint">Ajustar stock</p>

              {/* Type selector */}
              <div className="mb-3 flex rounded-[9px] border border-border overflow-hidden text-[13px]">
                {([
                  { key: 'IN'         as const, label: 'Ingreso',  Icon: ArrowDownToLine },
                  { key: 'OUT'        as const, label: 'Retiro',   Icon: ArrowUpFromLine },
                  { key: 'ADJUSTMENT' as const, label: 'Ajuste',   Icon: RotateCcw       },
                ] as const).map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMovType(key)}
                    className={`flex flex-1 items-center justify-center gap-1.5 py-2 transition-colors font-medium ${
                      movType === key ? 'bg-accent text-white' : 'bg-surface text-muted hover:bg-surface-2'
                    }`}
                    style={movType === key ? { background: 'var(--accent)' } : {}}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>

              <div className="mb-3">
                <label className="mb-1 block text-[12.5px] font-medium text-muted">Cantidad</label>
                <input
                  type="number" min={1} step={1}
                  className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-[13.5px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="0"
                  value={movQty}
                  onChange={(e) => setMovQty(parseInt(e.target.value) || '')}
                />
              </div>

              <div className="mb-3">
                <label className="mb-1 block text-[12.5px] font-medium text-muted">Notas (opcional)</label>
                <input
                  type="text"
                  className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-[13.5px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="Ej: recepción de proveedor"
                  value={movNotes}
                  onChange={(e) => setMovNotes(e.target.value)}
                />
              </div>

              {stockMutation.isError && (
                <p className="mb-2 rounded-[8px] border border-danger-subtle bg-danger-subtle px-3 py-2 text-[12.5px] text-danger">
                  Error al registrar movimiento
                </p>
              )}
              {movSuccess && (
                <p className="mb-2 rounded-[8px] border border-accent-subtle bg-accent-subtle px-3 py-2 text-[12.5px] text-accent-on">
                  Movimiento registrado correctamente
                </p>
              )}

              <button
                type="button"
                disabled={!movQty || stockMutation.isPending}
                onClick={() => stockMutation.mutate()}
                className="w-full rounded-[9px] py-2 text-[13.5px] font-semibold text-white disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {stockMutation.isPending ? 'Registrando...' : 'Registrar movimiento'}
              </button>
            </div>
          )}

          {/* Especificaciones */}
          <div className="border-b border-border px-5 py-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-faint">Especificaciones</p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[12.5px] font-medium text-muted">Unidad de medida</label>
                <input
                  className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-[13.5px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  value={specs.unit}
                  placeholder="unidad"
                  list="specs-unit-options"
                  onChange={(e) => setSpecs((s) => ({ ...s, unit: e.target.value }))}
                />
                <datalist id="specs-unit-options">
                  {['unidad', 'kg', 'litro', 'metro', 'par', 'caja', 'paquete', 'rollo', 'set'].map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-1 block text-[12.5px] font-medium text-muted">Peso (kg)</label>
                <input
                  type="number" min={0} step={0.001}
                  className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-[13.5px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="0.000"
                  value={specs.weightKg}
                  onChange={(e) => setSpecs((s) => ({ ...s, weightKg: e.target.value === '' ? '' : parseFloat(e.target.value) }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-[12.5px] font-medium text-muted">Dimensiones (cm) — Alto × Ancho × Fondo</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['heightCm', 'widthCm', 'depthCm'] as const).map((field, i) => (
                    <input
                      key={field}
                      type="number" min={0} step={0.1}
                      className="rounded-[9px] border border-border bg-surface px-3 py-2 text-[13.5px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      placeholder={['Alto', 'Ancho', 'Fondo'][i]}
                      value={specs[field]}
                      onChange={(e) => setSpecs((s) => ({ ...s, [field]: e.target.value === '' ? '' : parseFloat(e.target.value) }))}
                    />
                  ))}
                </div>
              </div>
            </div>

            {specsSuccess && (
              <p className="mt-3 rounded-[8px] border border-accent-subtle bg-accent-subtle px-3 py-2 text-[12.5px] text-accent-on">
                Especificaciones guardadas
              </p>
            )}
            {specsMutation.isError && (
              <p className="mt-3 rounded-[8px] border border-danger-subtle bg-danger-subtle px-3 py-2 text-[12.5px] text-danger">
                Error al guardar especificaciones
              </p>
            )}

            <button
              type="button"
              onClick={() => specsMutation.mutate()}
              disabled={specsMutation.isPending}
              className="mt-3 w-full rounded-[9px] py-2 text-[13.5px] font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {specsMutation.isPending ? 'Guardando...' : 'Guardar especificaciones'}
            </button>
          </div>

          {/* Proveedores */}
          <div className="border-b border-border px-5 py-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-faint">Proveedores</p>

            {suppliersLoading ? (
              <div className="space-y-1.5 mb-3">
                {[1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-[9px] bg-border" />)}
              </div>
            ) : productSuppliers.length === 0 ? (
              <p className="mb-3 text-[13px] text-muted">Sin proveedores asociados.</p>
            ) : (
              <div className="mb-3 space-y-1.5">
                {productSuppliers.map((ps) => (
                  <div key={ps.id} className="flex items-center gap-2 rounded-[9px] border border-border bg-surface-2 px-3 py-2">
                    <Building2 size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-ink truncate">{ps.supplier.name}</p>
                      {ps.costPrice != null && (
                        <p className="text-[11.5px] text-muted">{fmtGs(Number(ps.costPrice))}</p>
                      )}
                    </div>
                    {ps.isPreferred && (
                      <span className="rounded-[5px] bg-accent-subtle px-1.5 py-0.5 text-[10px] font-bold text-accent-on">Principal</span>
                    )}
                    {!ps.isPreferred && (
                      <button
                        title="Marcar como principal"
                        onClick={() => setPreferredMutation.mutate(ps.supplierId)}
                        className="shrink-0 text-faint hover:text-warn transition-colors"
                      >
                        <Star size={13} />
                      </button>
                    )}
                    <button
                      title="Quitar proveedor"
                      onClick={() => removeSupplierMutation.mutate(ps.supplierId)}
                      className="shrink-0 text-faint hover:text-danger transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add supplier */}
            {availableSuppliers.length > 0 && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select
                    className="flex-1 rounded-[9px] border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                  >
                    <option value="">Seleccionar proveedor…</option>
                    {availableSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    placeholder="Costo"
                    className="w-28 rounded-[9px] border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                    value={supplierCostPrice}
                    onChange={(e) => setSupplierCostPrice(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  disabled={!selectedSupplierId || addSupplierMutation.isPending}
                  onClick={() => addSupplierMutation.mutate()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-[9px] border border-border py-2 text-[13px] font-medium text-ink hover:bg-surface-2 disabled:opacity-40"
                >
                  <Plus size={13} />
                  {addSupplierMutation.isPending ? 'Agregando…' : 'Agregar proveedor'}
                </button>
                {addSupplierMutation.isError && (
                  <p className="rounded-[8px] border border-danger-subtle bg-danger-subtle px-3 py-2 text-[12.5px] text-danger">
                    {(addSupplierMutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al agregar proveedor'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-5 py-4 space-y-2">
            <button onClick={() => setShowEdit(true)} className="w-full rounded-[9px] border border-border px-4 py-2 text-[13.5px] font-medium text-ink hover:bg-surface-2">
              Editar producto
            </button>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="w-full rounded-[9px] border border-danger-subtle px-4 py-2 text-[13.5px] font-medium text-danger hover:bg-danger-subtle">
                Eliminar producto
              </button>
            ) : (
              <div className="rounded-[9px] border border-danger-subtle bg-danger-subtle px-4 py-3">
                <p className="text-[12.5px] text-danger mb-2">¿Confirmar eliminación?</p>
                <div className="flex gap-2">
                  <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} className="flex-1 rounded-[8px] bg-danger px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90 disabled:opacity-50">
                    {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-[8px] border border-border bg-surface text-ink px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-surface">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {showEdit && (
        <ProductModal
          categories={categories}
          brands={brands}
          initial={product}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            void queryClient.invalidateQueries({ queryKey: ['inventory-product', product.id] });
          }}
        />
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithStock | null>(null);

  const { data: products = [], isLoading } = useQuery<ProductWithStock[]>({
    queryKey: ['inventory-products', search, categoryFilter, brandFilter],
    queryFn: () =>
      inventoryApi.listProductsWithStock({
        search: search || undefined,
        categoryId: categoryFilter || undefined,
        brandId: brandFilter || undefined,
        isActive: true,
      }),
  });

  const { data: categories = [] } = useQuery({ queryKey: ['inventory-categories'], queryFn: inventoryApi.listCategories });
  const { data: brands = [] }     = useQuery({ queryKey: ['inventory-brands'],     queryFn: inventoryApi.listBrands });

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const valorInventario = products.reduce((s, p) => s + p.salePrice * p.stock, 0);
    const criticos = products.filter((p) => p.stock > 0 && p.stock <= 3).length;
    const agotados  = products.filter((p) => p.stock === 0).length;
    return { total: products.length, valorInventario, criticos, agotados };
  }, [products]);

  const sel =
    'rounded-[9px] border border-border bg-surface px-3 py-2 text-[13.5px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

  return (
    <div>
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[25px] font-extrabold tracking-tight text-ink">Inventario</h1>
          <p className="mt-[4px] text-[14px] text-muted">Gestión de productos y stock</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_2px_8px_rgba(16,185,129,0.3)]"
          style={{ background: 'var(--accent)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-strong)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)'; }}
        >
          <Plus size={15} />
          Nuevo producto
        </button>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div className="mb-5 grid grid-cols-4 gap-4">
        <InventoryKpi label="Productos" value={kpis.total} />
        <InventoryKpi label="Valor de inventario" value={fmtGsShort(kpis.valorInventario)} />
        <InventoryKpi label="Stock crítico"        value={kpis.criticos} danger={kpis.criticos > 0} />
        <InventoryKpi label="Agotados"             value={kpis.agotados}  danger={kpis.agotados > 0} />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <InventoryNav active="products" />

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            className="w-full rounded-[9px] border border-border bg-surface pl-8 pr-3 py-2 text-[13.5px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Buscar por nombre o modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="shrink-0 text-faint" />
          <select className={sel} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categories.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={sel} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
            <option value="">Todas las marcas</option>
            {brands.filter((b) => b.isActive).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="py-16 text-center text-[13.5px] text-faint">Cargando productos...</div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[13.5px] text-faint">No se encontraron productos.</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-[13.5px] font-medium text-accent-on underline underline-offset-2">
            Crear el primero
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-border bg-surface shadow-[var(--shadow-sm)]">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint">Producto</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint">Categoría</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint">Marca</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-faint">Stock</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-faint">P. Costo</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-faint">P. Venta</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-faint">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((product) => {
                const m = markup(product);
                return (
                  <tr
                    key={product.id}
                    onClick={() => setSelectedProduct(product)}
                    className="cursor-pointer transition-colors hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] border border-border bg-surface-2 text-muted">
                          <Package size={15} />
                        </span>
                        <div>
                          <p className="font-semibold text-ink">{product.name}</p>
                          {product.model && (
                            <p className="font-mono text-[11.5px] text-faint">{product.model}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{product.category?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted">{product.brand?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <StockBadge stock={product.stock} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[12.5px] text-muted">
                      {fmtGs(product.costPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[12.5px] font-semibold text-ink">
                      {fmtGs(product.salePrice)}
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
      )}

      {showCreate && (
        <ProductModal
          categories={categories}
          brands={brands}
          onClose={() => setShowCreate(false)}
          onSaved={() => setShowCreate(false)}
        />
      )}

      {selectedProduct && (
        <ProductDetailPanel
          product={selectedProduct}
          categories={categories}
          brands={brands}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
