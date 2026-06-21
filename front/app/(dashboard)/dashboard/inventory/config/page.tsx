'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Package, Settings } from 'lucide-react';
import { inventoryApi, type Brand, type Category } from '../../../../../lib/api/inventory';

// ── Sub-nav ────────────────────────────────────────────────────────────────────

function InventoryNav() {
  return (
    <div className="flex gap-1 border-b border-slate-200 mb-6">
      <Link
        href="/dashboard/inventory"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 -mb-px"
      >
        <Package size={15} />
        Productos
      </Link>
      <Link
        href="/dashboard/inventory/config"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-slate-900 text-slate-900 -mb-px"
      >
        <Settings size={15} />
        Configuración
      </Link>
    </div>
  );
}

// ── Active badge ───────────────────────────────────────────────────────────────

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Activa
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
      Inactiva
    </span>
  );
}

// ── Categories panel ───────────────────────────────────────────────────────────

function CategoriesPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: inventoryApi.listCategories,
  });

  const createMutation = useMutation({
    mutationFn: () => inventoryApi.createCategory(name.trim()),
    onSuccess: () => {
      setName('');
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['inventory-categories'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      setError(err?.response?.data?.message ?? 'Error al crear categoría');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (cat: Category) =>
      inventoryApi.updateCategory(cat.id, { isActive: !cat.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory-categories'] }),
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Categorías</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createMutation.mutate();
        }}
        className="mb-4 flex gap-2"
      >
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="Nombre de la categoría..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <Plus size={14} />
          Agregar
        </button>
      </form>
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {categories.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No hay categorías registradas.</p>
      ) : (
        <ul className="space-y-1.5">
          {categories.map((cat: Category) => (
            <li
              key={cat.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
            >
              <span className="text-sm text-slate-800">{cat.name}</span>
              <div className="flex items-center gap-2">
                <ActiveBadge isActive={cat.isActive} />
                <button
                  onClick={() => toggleMutation.mutate(cat)}
                  disabled={toggleMutation.isPending}
                  className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-50"
                >
                  {cat.isActive ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Brands panel ───────────────────────────────────────────────────────────────

function BrandsPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const { data: brands = [] } = useQuery({
    queryKey: ['inventory-brands'],
    queryFn: inventoryApi.listBrands,
  });

  const createMutation = useMutation({
    mutationFn: () => inventoryApi.createBrand(name.trim()),
    onSuccess: () => {
      setName('');
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['inventory-brands'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      setError(err?.response?.data?.message ?? 'Error al crear marca');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (brand: Brand) =>
      inventoryApi.updateBrand(brand.id, { isActive: !brand.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory-brands'] }),
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Marcas</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createMutation.mutate();
        }}
        className="mb-4 flex gap-2"
      >
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="Nombre de la marca..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <Plus size={14} />
          Agregar
        </button>
      </form>
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {brands.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No hay marcas registradas.</p>
      ) : (
        <ul className="space-y-1.5">
          {brands.map((brand: Brand) => (
            <li
              key={brand.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
            >
              <span className="text-sm text-slate-800">{brand.name}</span>
              <div className="flex items-center gap-2">
                <ActiveBadge isActive={brand.isActive} />
                <button
                  onClick={() => toggleMutation.mutate(brand)}
                  disabled={toggleMutation.isPending}
                  className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-50"
                >
                  {brand.isActive ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InventoryConfigPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Inventario</h1>
        <p className="mt-1 text-sm text-slate-500">Gestión de productos y stock</p>
      </div>

      <InventoryNav />

      <div className="grid grid-cols-2 gap-6">
        <CategoriesPanel />
        <BrandsPanel />
      </div>
    </div>
  );
}
