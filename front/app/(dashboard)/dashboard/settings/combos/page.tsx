'use client';

import { usePermission } from '@/lib/permissions';

import { RequirePermission } from '@/components/require-permission';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { settingsApi } from '../../../../../lib/api/settings';
import {
  combosApi,
  type SaleCombo,
  type ComboItemPayload,
  type ComboPriceMode,
  type CreateComboPayload,
} from '../../../../../lib/api/sales';
import { inventoryApi, type Product } from '../../../../../lib/api/inventory';
import { SearchSelect } from '../../components/search-select';
import { NumericInput } from '../../../../../components/numeric-input';

const NUM_CLS = 'h-9 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-ring';

function fmtPrice(n: number) {
  return `Gs. ${Math.round(n).toLocaleString('es-PY')}`;
}

function comboListPrice(combo: SaleCombo): number {
  const listTotal = combo.items.reduce((sum, it) => sum + it.product.salePrice * it.quantity, 0);
  if (combo.priceMode === 'FIXED') return combo.fixedPrice ?? 0;
  return listTotal * (1 - (combo.discountPercentage ?? 0) / 100);
}

// ── Combo form (alta / edición) ─────────────────────────────────────────────────

function ComboForm({
  products,
  initial,
  onSave,
  onCancel,
  saving,
}: {
  products: Product[];
  initial?: SaleCombo;
  onSave: (dto: CreateComboPayload) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [priceMode, setPriceMode] = useState<ComboPriceMode>(initial?.priceMode ?? 'FIXED');
  const [fixedPrice, setFixedPrice] = useState(initial?.fixedPrice ?? 0);
  const [discountPercentage, setDiscountPercentage] = useState(initial?.discountPercentage ?? 0);
  const [items, setItems] = useState<ComboItemPayload[]>(
    initial?.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) ?? [],
  );

  const listTotal = items.reduce((sum, it) => {
    const product = products.find((p) => p.id === it.productId);
    return sum + (product ? Number(product.salePrice) * it.quantity : 0);
  }, 0);

  const canSave =
    name.trim() &&
    items.length > 0 &&
    items.every((i) => i.productId) &&
    (priceMode === 'FIXED' ? fixedPrice > 0 : discountPercentage >= 0);

  return (
    <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 space-y-3">
      <p className="text-sm font-medium text-muted-foreground">{initial ? 'Editar combo' : 'Nuevo combo'}</p>

      <div>
        <p className="mb-1 text-xs text-muted-foreground/60">Nombre *</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Combo Cocina" className={NUM_CLS} />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted-foreground/60">Descripción</p>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" className={NUM_CLS} />
      </div>

      {/* Componentes */}
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground/60">Productos del combo</p>
        <div className="space-y-1.5">
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <div className="flex-1">
                <SearchSelect<Product>
                  items={products}
                  value={item.productId}
                  onChange={(id) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, productId: id } : it)))}
                  getKey={(p) => p.id}
                  getLabel={(p) => p.name}
                  getDescription={(p) => fmtPrice(Number(p.salePrice))}
                  filterFn={(p, q) => p.name.toLowerCase().includes(q.toLowerCase())}
                  placeholder="Buscar producto..."
                />
              </div>
              <div className="w-20">
                <NumericInput
                  value={item.quantity}
                  onChange={(v) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: Math.max(1, Math.round(v)) } : it)))}
                  className={NUM_CLS}
                />
              </div>
              <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} className="text-muted-foreground/50 hover:text-destructive">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, { productId: '', quantity: 1 }])}
          className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus size={14} />
          Agregar producto
        </button>
      </div>

      {/* Modo de precio */}
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground/60">Precio del combo</p>
        <div className="flex gap-2 mb-2">
          {([['FIXED', 'Precio fijo'], ['SUM_WITH_DISCOUNT', 'Suma con descuento']] as [ComboPriceMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPriceMode(mode)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                priceMode === mode ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:border-ring/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {priceMode === 'FIXED' ? (
          <div className="w-40">
            <NumericInput value={fixedPrice} onChange={setFixedPrice} className={NUM_CLS} placeholder="Precio" />
          </div>
        ) : (
          <div className="relative w-24">
            <input
              type="number" min="0" max="100" step="1"
              value={discountPercentage}
              onChange={(e) => setDiscountPercentage(Number(e.target.value))}
              className={NUM_CLS}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">%</span>
          </div>
        )}
        {items.length > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground/60">
            Precio de lista de los componentes: {fmtPrice(listTotal)}
            {priceMode === 'SUM_WITH_DISCOUNT' && discountPercentage > 0 && (
              <> — con descuento: <strong className="text-foreground">{fmtPrice(listTotal * (1 - discountPercentage / 100))}</strong></>
            )}
          </p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={() =>
            onSave({
              name: name.trim(),
              description: description.trim() || undefined,
              priceMode,
              fixedPrice: priceMode === 'FIXED' ? fixedPrice : undefined,
              discountPercentage: priceMode === 'SUM_WITH_DISCOUNT' ? discountPercentage : undefined,
              items,
            })
          }
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={14} />
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:bg-muted/20">
          <X size={14} />
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Combo row ────────────────────────────────────────────────────────────────

function ComboRow({ combo, onEdit, onDelete }: { combo: SaleCombo; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/30">
        <Boxes size={18} className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{combo.name}</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          {combo.items.length} producto{combo.items.length !== 1 ? 's' : ''} · {combo.priceMode === 'FIXED' ? 'Precio fijo' : `${combo.discountPercentage}% descuento`} · {fmtPrice(comboListPrice(combo))}
        </p>
      </div>
      <RequirePermission permission="sales:combos:manage">
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onEdit} className="text-muted-foreground/60 hover:text-foreground transition-colors">
            <Pencil size={14} />
          </button>
          <button type="button" onClick={onDelete} className="text-muted-foreground/60 hover:text-destructive transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </RequirePermission>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CombosSettingsPage() {
  const qc = useQueryClient();
  const canManageCombos = usePermission('sales:combos:manage');
  const canToggle = usePermission('tenants:update');
  const [showForm, setShowForm] = useState(false);
  const [editingCombo, setEditingCombo] = useState<SaleCombo | null>(null);

  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ['sales-config'],
    queryFn: settingsApi.getSalesConfig,
  });
  const { data: combos = [], isLoading: loadingCombos } = useQuery({
    queryKey: ['sale-combos'],
    queryFn: () => combosApi.list(),
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products-for-combos'],
    queryFn: () => inventoryApi.listProducts(),
  });

  const toggleEnabled = useMutation({
    mutationFn: (combosEnabled: boolean) => settingsApi.setCombosEnabled(combosEnabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-config'] }),
  });

  const createCombo = useMutation({
    mutationFn: (dto: CreateComboPayload) => combosApi.create(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sale-combos'] });
      setShowForm(false);
    },
  });

  const updateCombo = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreateComboPayload }) => combosApi.update(id, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sale-combos'] });
      setEditingCombo(null);
    },
  });

  const removeCombo = useMutation({
    mutationFn: (id: string) => combosApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sale-combos'] }),
  });

  const enabled = config?.combosEnabled ?? false;
  const isLoading = loadingConfig || loadingCombos;

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/30">
          <Boxes size={20} className="text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Combos de Venta</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Armá paquetes de productos con un precio conjunto para agregar rápido a un pedido.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/30" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Toggle */}
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-6 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">Combos habilitados</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Permite elegir “Combo” al armar un pedido en vez de agregar producto por producto.
              </p>
            </div>
            <button
              type="button"
              disabled={!canToggle || toggleEnabled.isPending}
              title={canToggle ? undefined : 'Requiere permiso para modificar la configuración de la empresa'}
              onClick={() => toggleEnabled.mutate(!enabled)}
              className={`relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-muted/50'} disabled:opacity-50`}
            >
              <span className={`absolute left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {enabled && (
            <div className="rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Combos</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Cada combo se agrega al pedido como sus líneas individuales.</p>
                </div>
                {canManageCombos && !showForm && !editingCombo && (
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Plus size={14} />
                    Nuevo combo
                  </button>
                )}
              </div>

              <div className="p-4 space-y-2">
                {showForm && (
                  <ComboForm
                    products={products}
                    onSave={(dto) => createCombo.mutate(dto)}
                    onCancel={() => setShowForm(false)}
                    saving={createCombo.isPending}
                  />
                )}

                {combos.length === 0 && !showForm ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-muted-foreground/60">No hay combos configurados.</p>
                    <RequirePermission permission="sales:combos:manage">
                      <button type="button" onClick={() => setShowForm(true)} className="mt-2 text-sm font-medium text-muted-foreground hover:text-foreground underline underline-offset-2">
                        Creá el primero
                      </button>
                    </RequirePermission>
                  </div>
                ) : (
                  combos.map((combo) =>
                    editingCombo?.id === combo.id ? (
                      <ComboForm
                        key={combo.id}
                        products={products}
                        initial={combo}
                        onSave={(dto) => updateCombo.mutate({ id: combo.id, dto })}
                        onCancel={() => setEditingCombo(null)}
                        saving={updateCombo.isPending}
                      />
                    ) : (
                      <ComboRow
                        key={combo.id}
                        combo={combo}
                        onEdit={() => setEditingCombo(combo)}
                        onDelete={() => {
                          if (confirm(`¿Eliminar el combo "${combo.name}"?`)) removeCombo.mutate(combo.id);
                        }}
                      />
                    ),
                  )
                )}
              </div>
            </div>
          )}

          {!enabled && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 dark:bg-amber-950/30 dark:border-amber-800/30">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Los combos están deshabilitados. El modal de “Nuevo pedido” solo permite agregar productos individuales.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
