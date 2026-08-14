'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Package, ChartBarStacked, ArrowLeftRight } from 'lucide-react';
import { inventoryApi, type Brand, type Category } from '../../../../../lib/api/inventory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ── Sub-nav ────────────────────────────────────────────────────────────────────

function InventoryNav() {
  return (
    <div className="flex gap-1 border-b border-border mb-6">
      <Link
        href="/dashboard/inventory"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground -mb-px"
      >
        <Package size={15} />
        Productos
      </Link>
      <Link
        href="/dashboard/inventory/movements"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground -mb-px"
      >
        <ArrowLeftRight size={15} />
        Movimientos
      </Link>
      <Link
        href="/dashboard/inventory/config"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-primary text-foreground -mb-px"
      >
        <ChartBarStacked size={15} />
        Categorias
      </Link>
    </div>
  );
}

// ── Active badge ───────────────────────────────────────────────────────────────

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive
    ? <Badge variant="outline" className="bg-accent-subtle text-accent-on border-accent-on/20">Activa</Badge>
    : <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-border">Inactiva</Badge>;
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
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Categorías</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createMutation.mutate();
        }}
        className="mb-4 flex gap-2"
      >
        <Input
          className="flex-1"
          placeholder="Nombre de la categoría..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Button type="submit" size="sm" disabled={createMutation.isPending}>
          <Plus size={14} />
          Agregar
        </Button>
      </form>
      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      {categories.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground/60">No hay categorías registradas.</p>
      ) : (
        <ul className="space-y-1.5">
          {categories.map((cat: Category) => (
            <li
              key={cat.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
            >
              <span className="text-sm text-foreground">{cat.name}</span>
              <div className="flex items-center gap-2">
                <ActiveBadge isActive={cat.isActive} />
                <button
                  type="button"
                  onClick={() => toggleMutation.mutate(cat)}
                  disabled={toggleMutation.isPending}
                  className="text-xs text-muted-foreground/60 hover:text-foreground disabled:opacity-50"
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
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Marcas</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createMutation.mutate();
        }}
        className="mb-4 flex gap-2"
      >
        <Input
          className="flex-1"
          placeholder="Nombre de la marca..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Button type="submit" size="sm" disabled={createMutation.isPending}>
          <Plus size={14} />
          Agregar
        </Button>
      </form>
      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      {brands.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground/60">No hay marcas registradas.</p>
      ) : (
        <ul className="space-y-1.5">
          {brands.map((brand: Brand) => (
            <li
              key={brand.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
            >
              <span className="text-sm text-foreground">{brand.name}</span>
              <div className="flex items-center gap-2">
                <ActiveBadge isActive={brand.isActive} />
                <button
                  type="button"
                  onClick={() => toggleMutation.mutate(brand)}
                  disabled={toggleMutation.isPending}
                  className="text-xs text-muted-foreground/60 hover:text-foreground disabled:opacity-50"
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
        <h1 className="text-2xl font-semibold text-foreground">Inventario</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gestión de productos y stock</p>
      </div>

      <InventoryNav />

      <div className="grid grid-cols-2 gap-6">
        <CategoriesPanel />
        <BrandsPanel />
      </div>
    </div>
  );
}
