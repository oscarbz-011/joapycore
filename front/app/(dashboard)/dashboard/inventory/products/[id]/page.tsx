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

  const inp = 'w-full rounded-[9px] border border-border bg-surface text-ink px-3 py-2 text-[13.5px] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';
  const lbl = 'block text-[12px] font-medium text-muted mb-1';
  const set = <K extends keyof CreateStockMovementPayload>(k: K, v: CreateStockMovementPayload[K]) =>
    setDto((d) => ({ ...d, [k]: v }));

  const MANUAL_REASONS: MovementReason[] = ['PURCHASE', 'CUSTOMER_RETURN', 'ADJUSTMENT', 'TRANSFER'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-[18px] bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-[15px] font-bold text-ink">Registrar movimiento</h2>
          <button onClick={onClose} className="rounded-[8px] p-1.5 text-muted hover:bg-surface-2">
            <X size={17} />
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}
          className="px-6 py-5 space-y-4"
        >
          <div>
            <label className={lbl}>Motivo *</label>
            <select
              className={inp}
              value={dto.reason}
              onChange={(e) => set('reason', e.target.value as MovementReason)}
            >
              {MANUAL_REASONS.map((r) => (
                <option key={r} value={r}>{REASON_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Cantidad *</label>
              <NumericInput
                value={dto.quantity}
                onChange={(v) => set('quantity', Math.max(1, Math.round(v)))}
                className={inp}
              />
            </div>

            {dto.reason === 'ADJUSTMENT' && (
              <div>
                <label className={lbl}>Dirección *</label>
                <div className="flex gap-2">
                  {(['IN', 'OUT'] as const).map((d) => (
                    <label
                      key={d}
                      className={`flex-1 flex items-center justify-center rounded-[9px] border px-3 py-2 text-[13px] font-medium cursor-pointer transition-colors ${
                        dto.direction === d
                          ? 'border-ink bg-ink text-canvas'
                          : 'border-border text-muted hover:border-border-strong'
                      }`}
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
              <div>
                <label className={lbl}>Depósito origen</label>
                <input className={inp} placeholder="ID origen" value={dto.warehouseId ?? ''} onChange={(e) => set('warehouseId', e.target.value || undefined)} />
              </div>
              <div>
                <label className={lbl}>Depósito destino *</label>
                <input className={inp} placeholder="ID destino" value={dto.toWarehouseId ?? ''} onChange={(e) => set('toWarehouseId', e.target.value || undefined)} required />
              </div>
            </div>
          ) : (
            <div>
              <label className={lbl}>Depósito (opcional)</label>
              <input className={inp} placeholder="ID del depósito" value={dto.warehouseId ?? ''} onChange={(e) => set('warehouseId', e.target.value || undefined)} />
            </div>
          )}

          <div>
            <label className={lbl}>Notas (opcional)</label>
            <input className={inp} placeholder="Ej: recepción factura #001" value={dto.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </div>

          {error && (
            <div className="rounded-[9px] border border-danger-subtle bg-danger-subtle px-4 py-3 text-[13px] text-danger">{error}</div>
          )}

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button type="button" onClick={onClose} className="rounded-[9px] border border-border px-4 py-2 text-[13.5px] text-ink hover:bg-surface-2">Cancelar</button>
            <button
              type="submit"
              disabled={mutation.isPending || dto.quantity < 1}
              className="rounded-[9px] px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {mutation.isPending ? 'Registrando...' : 'Registrar'}
            </button>
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

  // ── Edit form state ──────────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState<UpdateProductPayload>({});
  const editMutation = useMutation({
    mutationFn: () => inventoryApi.updateProduct(id, editForm),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-product', id] });
      setShowEdit(false);
    },
  });

  const inp = 'w-full rounded-[9px] border border-border bg-surface text-ink px-3 py-2 text-[13.5px] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';
  const lbl = 'block text-[12px] font-medium text-muted mb-1';

  if (isLoading) {
    return (
      <div className="py-20 text-center text-[13.5px] text-faint">Cargando producto...</div>
    );
  }

  if (!product) {
    return (
      <div className="py-20 text-center">
        <p className="text-[13.5px] text-faint">Producto no encontrado.</p>
        <button onClick={() => router.replace('/dashboard/inventory')} className="mt-3 text-[13.5px] text-accent-on underline">
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
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="mb-5 flex items-center gap-1.5 text-[13px] text-muted hover:text-ink transition-colors"
      >
        <ArrowLeft size={14} />
        Volver al inventario
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <span className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-[12px] border border-border bg-surface-2 text-muted">
          <Package size={22} />
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-tight text-ink">{product.name}</h1>
          {product.model && <p className="font-mono text-[13px] text-faint mt-0.5">{product.model}</p>}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {product.category && <span className="text-[12.5px] text-muted">{product.category.name}</span>}
            {product.brand && <span className="text-[12.5px] text-muted">· {product.brand.name}</span>}
            {!product.isActive && (
              <span className="rounded-[6px] bg-danger-subtle px-2 py-0.5 text-[11px] font-bold text-danger">Inactivo</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
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
            className="rounded-[9px] border border-border px-3 py-2 text-[13px] font-medium text-ink hover:bg-surface-2"
          >
            Editar
          </button>
          {activeTab === 'movements' && (
            <button
              onClick={() => setShowMovement(true)}
              className="flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[13px] font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              <Plus size={13} />
              Registrar
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {[
          {
            label: 'Stock',
            value: product.isSerialized ? `${product.stock} u.` : `${product.stock} ${product.unit}`,
            cls: product.stock === 0 ? 'text-danger' : product.stock <= 3 ? 'text-warn' : 'text-ink',
          },
          { label: 'Precio costo', value: fmtGs(product.costPrice), cls: 'text-ink' },
          { label: 'Precio venta', value: fmtGs(product.salePrice), cls: 'text-ink' },
          { label: 'Margen', value: m != null ? `${m.toFixed(1)}%` : '—', cls: 'text-accent-on' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-[12px] border border-border bg-surface p-[12px_14px]">
            <p className="text-[11.5px] font-medium text-muted">{label}</p>
            <p className={`mt-0.5 text-[18px] font-extrabold tabular-nums ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-5">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-[14px] py-[10px] text-[13.5px] font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-accent text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
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
              className="rounded-[14px] border border-border bg-surface p-5 space-y-4"
            >
              <p className="text-[11px] font-bold uppercase tracking-widest text-faint">Editar información</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Nombre *</label>
                  <input className={inp} value={editForm.name ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>
                <div>
                  <label className={lbl}>Modelo</label>
                  <input className={inp} value={editForm.model ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value || undefined }))} />
                </div>
              </div>
              <div>
                <label className={lbl}>Descripción</label>
                <textarea className={`${inp} resize-none`} rows={2} value={editForm.description ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value || undefined }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Precio costo (PYG) *</label>
                  <NumericInput value={editForm.costPrice ?? 0} onChange={(v) => setEditForm((f) => ({ ...f, costPrice: v }))} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Precio venta (PYG) *</label>
                  <NumericInput value={editForm.salePrice ?? 0} onChange={(v) => setEditForm((f) => ({ ...f, salePrice: v }))} className={inp} />
                </div>
              </div>
              {editMutation.isError && (
                <p className="rounded-[9px] border border-danger-subtle bg-danger-subtle px-4 py-3 text-[13px] text-danger">Error al guardar</p>
              )}
              <div className="flex gap-3">
                <button type="submit" disabled={editMutation.isPending} className="rounded-[9px] px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                  {editMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button type="button" onClick={() => setShowEdit(false)} className="rounded-[9px] border border-border px-4 py-2 text-[13.5px] text-ink hover:bg-surface-2">
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-[14px] border border-border bg-surface divide-y divide-border">
              {[
                { label: 'Nombre', value: product.name },
                { label: 'Modelo', value: product.model ?? '—' },
                { label: 'Descripción', value: product.description ?? '—' },
                { label: 'Categoría', value: product.category?.name ?? '—' },
                { label: 'Marca', value: product.brand?.name ?? '—' },
                { label: 'Unidad', value: product.unit },
                { label: 'Tipo', value: product.isSerialized ? 'Serializado (por N/S)' : 'Por cantidad' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-baseline justify-between px-5 py-3">
                  <span className="text-[12.5px] text-muted w-32 shrink-0">{label}</span>
                  <span className="text-[13.5px] text-ink text-right">{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Danger zone */}
          <div className="rounded-[14px] border border-danger-subtle bg-danger-subtle/30 p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-danger mb-3">Zona de peligro</p>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-[9px] border border-danger px-4 py-2 text-[13px] font-medium text-danger hover:bg-danger-subtle"
              >
                Eliminar producto
              </button>
            ) : (
              <div>
                <p className="text-[13px] text-danger mb-3">¿Confirmar la eliminación? Esta acción no se puede deshacer.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="rounded-[8px] bg-danger px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="rounded-[8px] border border-border bg-surface px-4 py-2 text-[13px] font-medium text-ink hover:bg-surface-2">
                    Cancelar
                  </button>
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
              <p className="text-[13.5px] text-faint">Sin movimientos registrados para este producto.</p>
              <button onClick={() => setShowMovement(true)} className="mt-3 text-[13.5px] font-medium text-accent-on underline underline-offset-2">
                Registrar el primero
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[14px] border border-border bg-surface shadow-[var(--shadow-sm)]">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-border bg-surface-2">
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint">Fecha</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint">Motivo</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-faint">Cantidad</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint">Depósito</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movements.map((mv) => (
                    <tr key={mv.id} className="hover:bg-surface-2">
                      <td className="px-4 py-3 text-[12.5px] text-muted tabular-nums whitespace-nowrap">{fmtDate(mv.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-[6px] bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-muted">
                          {mv.reason ? REASON_LABELS[mv.reason] : mv.type}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${mv.quantity > 0 ? 'text-accent-on' : 'text-danger'}`}>
                        {mv.quantity > 0 ? `+${mv.quantity}` : String(mv.quantity)}
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-muted">{mv.warehouse?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-[12.5px] text-muted max-w-[180px] truncate">{mv.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Proveedores tab ──────────────────────────────────────────────────── */}
      {activeTab === 'suppliers' && (
        <div className="space-y-4">
          {suppliersLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-[9px] bg-border" />)}
            </div>
          ) : productSuppliers.length === 0 ? (
            <p className="text-[13.5px] text-muted">Sin proveedores asociados.</p>
          ) : (
            <div className="space-y-2">
              {productSuppliers.map((ps) => (
                <div key={ps.id} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-3">
                  <Building2 size={15} className="shrink-0 text-faint" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink">{ps.supplier.name}</p>
                    {ps.costPrice != null && <p className="text-[12px] text-muted">{fmtGs(Number(ps.costPrice))}</p>}
                  </div>
                  {ps.isPreferred && (
                    <span className="rounded-[5px] bg-accent-subtle px-2 py-0.5 text-[11px] font-bold text-accent-on">Principal</span>
                  )}
                  {!ps.isPreferred && (
                    <button title="Marcar como principal" onClick={() => setPreferredMutation.mutate(ps.supplierId)} className="text-faint hover:text-warn transition-colors">
                      <Star size={14} />
                    </button>
                  )}
                  <button title="Quitar proveedor" onClick={() => removeSupplierMutation.mutate(ps.supplierId)} className="text-faint hover:text-danger transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {availableSuppliers.length > 0 && (
            <div className="rounded-[12px] border border-border bg-surface p-4 space-y-3">
              <p className="text-[12px] font-semibold text-muted">Agregar proveedor</p>
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
                <NumericInput
                  value={supplierCostPrice}
                  onChange={setSupplierCostPrice}
                  placeholder="0"
                  className="w-28 rounded-[9px] border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={!selectedSupplierId || addSupplierMutation.isPending}
                onClick={() => addSupplierMutation.mutate()}
                className="flex items-center gap-1.5 rounded-[9px] border border-border px-4 py-2 text-[13px] font-medium text-ink hover:bg-surface-2 disabled:opacity-40"
              >
                <Plus size={13} />
                {addSupplierMutation.isPending ? 'Agregando…' : 'Agregar proveedor'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Unidades tab (serialized) ────────────────────────────────────────── */}
      {activeTab === 'units' && product.isSerialized && (
        <div className="space-y-4">
          {unitsLoading ? (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-[9px] bg-border" />)}
            </div>
          ) : units.length === 0 ? (
            <p className="text-[13.5px] text-muted">Sin unidades registradas aún.</p>
          ) : (
            <div className="overflow-hidden rounded-[12px] border border-border divide-y divide-border">
              {units.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-mono text-[13px] text-ink">{u.serialNumber}</span>
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
          )}

          <div className="rounded-[12px] border border-border bg-surface p-4 space-y-3">
            <p className="text-[12px] font-semibold text-muted">Ingresar números de serie <span className="font-normal text-faint">(uno por línea)</span></p>
            <textarea
              rows={4}
              className="w-full resize-none rounded-[9px] border border-border bg-surface px-3 py-2 font-mono text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder={'SN-001\nSN-002\nSN-003'}
              value={serialInput}
              onChange={(e) => setSerialInput(e.target.value)}
            />
            {serialInput.trim() && (
              <p className="text-[11.5px] text-faint">
                {serialInput.split('\n').filter((s) => s.trim()).length} número(s) a registrar
              </p>
            )}
            {unitsMutation.isError && (
              <p className="rounded-[8px] border border-danger-subtle bg-danger-subtle px-3 py-2 text-[12.5px] text-danger">
                {(unitsMutation.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar unidades'}
              </p>
            )}
            <button
              type="button"
              disabled={!serialInput.trim() || unitsMutation.isPending}
              onClick={() => {
                const sns = serialInput.split('\n').map((s) => s.trim()).filter(Boolean);
                unitsMutation.mutate(sns);
              }}
              className="rounded-[9px] px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {unitsMutation.isPending ? 'Registrando...' : 'Registrar unidades'}
            </button>
          </div>
        </div>
      )}

      {showMovement && <MovementModal productId={id} onClose={() => setShowMovement(false)} />}

      {/* Inline edit collapse indicator — only show when not editing */}
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
            className="flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink transition-colors"
          >
            <ChevronDown size={13} />
            Editar información del producto
          </button>
        </div>
      )}
    </div>
  );
}
