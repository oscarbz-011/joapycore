'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X, Package, Settings } from 'lucide-react';
import {
  inventoryApi,
  type Brand,
  type Category,
  type CreateProductPayload,
  type Product,
  type ProductWithStock,
} from '../../../../lib/api/inventory';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(n);
}

// ── Sub-nav ────────────────────────────────────────────────────────────────────

function InventoryNav() {
  return (
    <div className="flex gap-1 border-b border-slate-200 mb-6">
      <Link
        href="/dashboard/inventory"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-slate-900 text-slate-900 -mb-px"
      >
        <Package size={15} />
        Productos
      </Link>
      <Link
        href="/dashboard/inventory/config"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 -mb-px"
      >
        <Settings size={15} />
        Configuración
      </Link>
    </div>
  );
}

// ── Type badges ────────────────────────────────────────────────────────────────

function TypeBadge({ isSerialized }: { isSerialized: boolean }) {
  return isSerialized ? (
    <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
      Serializado
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      Por cantidad
    </span>
  );
}

// ── Create / Edit modal ────────────────────────────────────────────────────────

const EMPTY_FORM: CreateProductPayload = {
  categoryId: '',
  brandId: '',
  name: '',
  model: '',
  description: '',
  isSerialized: false,
  unit: 'unidad',
  costPrice: 0,
  salePrice: 0,
};

function ProductModal({
  categories,
  brands,
  initial,
  onClose,
  onSaved,
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
      ? {
          categoryId: initial.category?.id ?? '',
          brandId: initial.brand?.id ?? '',
          name: initial.name,
          model: initial.model ?? '',
          description: initial.description ?? '',
          isSerialized: initial.isSerialized,
          unit: initial.unit,
          costPrice: initial.costPrice,
          salePrice: initial.salePrice,
        }
      : EMPTY_FORM,
  );
  const [error, setError] = useState('');

  const set = <K extends keyof CreateProductPayload>(k: K, v: CreateProductPayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      initial
        ? inventoryApi.updateProduct(initial.id, {
            ...form,
            model: form.model || undefined,
            description: form.description || undefined,
          })
        : inventoryApi.createProduct({
            ...form,
            model: form.model || undefined,
            description: form.description || undefined,
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      onSaved();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al guardar'));
    },
  });

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';
  const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {initial ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            mutation.mutate();
          }}
          className="px-6 py-5 space-y-5"
        >
          {/* Clasificación */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Clasificación
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Categoría *</label>
                <select
                  className={inputCls}
                  value={form.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                  required
                >
                  <option value="">— Seleccionar —</option>
                  {categories.filter((c) => c.isActive).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Marca *</label>
                <select
                  className={inputCls}
                  value={form.brandId}
                  onChange={(e) => set('brandId', e.target.value)}
                  required
                >
                  <option value="">— Seleccionar —</option>
                  {brands.filter((b) => b.isActive).map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Identificación */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Identificación
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  required
                  placeholder="Heladera familiar"
                />
              </div>
              <div>
                <label className={labelCls}>Modelo</label>
                <input
                  className={inputCls}
                  value={form.model ?? ''}
                  onChange={(e) => set('model', e.target.value)}
                  placeholder="HRT-500"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelCls}>Descripción</label>
              <textarea
                className={`${inputCls} resize-none`}
                rows={2}
                value={form.description ?? ''}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Detalles adicionales del producto..."
              />
            </div>
          </div>

          {/* Precios y tipo */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Precios y tipo
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Precio costo (PYG) *</label>
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={form.costPrice || ''}
                  onChange={(e) => set('costPrice', parseFloat(e.target.value) || 0)}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Precio venta (PYG) *</label>
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={form.salePrice || ''}
                  onChange={(e) => set('salePrice', parseFloat(e.target.value) || 0)}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Unidad</label>
                <input
                  className={inputCls}
                  value={form.unit}
                  onChange={(e) => set('unit', e.target.value)}
                  placeholder="unidad"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isSerialized}
                  onChange={(e) => set('isSerialized', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                />
                <span className="text-sm font-medium text-slate-700">
                  Producto serializado
                </span>
              </label>
              <p className="mt-0.5 ml-6 text-xs text-slate-400">
                Activar si cada unidad tiene número de serie propio (ej: electrodomésticos).
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
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
  product,
  categories,
  brands,
  onClose,
}: {
  product: Product;
  categories: Category[];
  brands: Brand[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: detail, isLoading } = useQuery<ProductWithStock>({
    queryKey: ['inventory-product', product.id],
    queryFn: () => inventoryApi.getProduct(product.id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => inventoryApi.deleteProduct(product.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      onClose();
    },
  });

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <aside className="relative z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 truncate">{product.name}</p>
              {product.model && (
                <p className="text-xs text-slate-400 mt-0.5">Modelo: {product.model}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <TypeBadge isSerialized={product.isSerialized} />
                {product.category && (
                  <span className="text-xs text-slate-400">{product.category.name}</span>
                )}
                {product.brand && (
                  <span className="text-xs text-slate-400">· {product.brand.name}</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="ml-3 shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>

          {/* Stock */}
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Stock</p>
            {isLoading ? (
              <p className="text-sm text-slate-400">Calculando...</p>
            ) : (
              <p className="text-2xl font-bold text-slate-900">
                {detail?.stock ?? 0}
                <span className="ml-1.5 text-sm font-normal text-slate-500">{product.unit}</span>
              </p>
            )}
          </div>

          {/* Precios */}
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Precios</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Costo</span>
                <span className="font-medium text-slate-700">{formatPrice(product.costPrice)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Venta</span>
                <span className="font-semibold text-slate-900">{formatPrice(product.salePrice)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-100 pt-2">
                <span className="text-slate-500">Margen</span>
                <span className="font-medium text-emerald-600">
                  {product.costPrice > 0
                    ? `${(((product.salePrice - product.costPrice) / product.costPrice) * 100).toFixed(1)}%`
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 py-4 space-y-2">
            <button
              onClick={() => setShowEdit(true)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Editar producto
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Eliminar producto
              </button>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs text-red-700 mb-2">¿Confirmar eliminación?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
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
  const [typeFilter, setTypeFilter] = useState<'' | 'true' | 'false'>('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['inventory-products', search, categoryFilter, brandFilter, typeFilter],
    queryFn: () =>
      inventoryApi.listProducts({
        search: search || undefined,
        categoryId: categoryFilter || undefined,
        brandId: brandFilter || undefined,
        isSerialized: typeFilter === '' ? undefined : typeFilter === 'true',
        isActive: true,
      }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: inventoryApi.listCategories,
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['inventory-brands'],
    queryFn: inventoryApi.listBrands,
  });

  const selectCls =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 bg-white';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Inventario</h1>
          <p className="mt-1 text-sm text-slate-500">Gestión de productos y stock</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          <Plus size={16} />
          Nuevo producto
        </button>
      </div>

      <InventoryNav />

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            placeholder="Buscar por nombre o modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className={selectCls} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.filter((c) => c.isActive).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className={selectCls} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
          <option value="">Todas las marcas</option>
          {brands.filter((b) => b.isActive).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select className={selectCls} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as '' | 'true' | 'false')}>
          <option value="">Todos los tipos</option>
          <option value="true">Serializados</option>
          <option value="false">Por cantidad</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-slate-400">Cargando productos...</div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-slate-400">No se encontraron productos.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm font-medium text-slate-900 underline underline-offset-2"
          >
            Crear el primero
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-left">Categoría</th>
                <th className="px-4 py-3 text-left">Marca</th>
                <th className="px-4 py-3 text-right">P. Costo</th>
                <th className="px-4 py-3 text-right">P. Venta</th>
                <th className="px-4 py-3 text-left">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((product) => (
                <tr
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className="cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{product.name}</div>
                    {product.model && (
                      <div className="text-xs text-slate-400">{product.model}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {product.category?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {product.brand?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500 text-xs">
                    {formatPrice(product.costPrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-slate-800">
                    {formatPrice(product.salePrice)}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge isSerialized={product.isSerialized} />
                  </td>
                </tr>
              ))}
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
