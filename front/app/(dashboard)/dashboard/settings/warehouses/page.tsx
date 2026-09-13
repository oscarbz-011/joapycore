'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Star, Warehouse, MapPin, LayoutGrid, List } from 'lucide-react';
import { warehousesApi, type Warehouse as WarehouseType, type CreateWarehousePayload } from '../../../../../lib/api/warehouses';
import { branchesApi, type Branch } from '../../../../../lib/api/branches';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// ── Warehouse form (side panel) ───────────────────────────────────────────────

function WarehouseForm({
  initial, branches, onClose,
}: { initial?: WarehouseType; branches: Branch[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateWarehousePayload>(
    initial
      ? { name: initial.name, address: initial.address ?? '', branchId: initial.branchId ?? undefined, isDefault: initial.isDefault }
      : { name: '', address: '', branchId: undefined, isDefault: false },
  );
  const [error, setError] = useState('');

  function set<K extends keyof CreateWarehousePayload>(k: K, v: CreateWarehousePayload[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: CreateWarehousePayload = {
        name: form.name.trim(),
        address: (form.address as string)?.trim() || undefined,
        branchId: form.branchId || undefined,
        isDefault: form.isDefault,
      };
      return initial ? warehousesApi.updateWarehouse(initial.id, payload) : warehousesApi.createWarehouse(payload);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['warehouses'] }); onClose(); },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al guardar'));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () => warehousesApi.updateWarehouse(initial!.id, { isActive: !initial!.isActive }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['warehouses'] }); onClose(); },
  });

  const inp = 'w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30';
  const lbl = 'block text-xs font-medium text-muted-foreground mb-1';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{initial ? initial.name : 'Nuevo depósito'}</h2>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted/20"><X size={16} /></button>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setError(''); saveMutation.mutate(); }}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
      >
        <div>
          <label className={lbl}>Nombre *</label>
          <input className={inp} value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Depósito Principal" />
        </div>

        <div>
          <label className={lbl}>Sucursal</label>
          <Select value={form.branchId || 'none'} onValueChange={(v) => set('branchId', v && v !== 'none' ? v : undefined)}>
            <SelectTrigger className="w-full">
              <span className="flex-1 text-left text-sm truncate">{branches.find((b) => b.id === form.branchId)?.name ?? 'Sin sucursal asignada'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin sucursal asignada</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className={lbl}>Dirección</label>
          <input className={inp} value={form.address as string} onChange={(e) => set('address', e.target.value)} placeholder="Av. Industrial 4321" />
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={form.isDefault as boolean} onChange={(e) => set('isDefault', e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
          <span className="text-sm font-medium text-muted-foreground">Depósito por defecto</span>
        </label>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        )}

        <div className="pt-2 border-t border-border space-y-2">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear depósito'}
          </button>
          {initial && (
            <button
              type="button"
              onClick={() => toggleActiveMutation.mutate()}
              disabled={toggleActiveMutation.isPending}
              className={`w-full rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                initial.isActive ? 'border-border text-muted-foreground hover:bg-muted/20' : 'border-primary/30 text-primary hover:bg-primary/5'
              }`}
            >
              {initial.isActive ? 'Desactivar depósito' : 'Activar depósito'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Grid card ─────────────────────────────────────────────────────────────────

function WarehouseCard({ wh, selected, onClick }: { wh: WarehouseType; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col rounded-[14px] border bg-card p-5 cursor-pointer transition-colors hover:border-primary/40 ${
        selected ? 'border-primary/50 bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
          wh.isActive ? 'bg-primary/10' : 'bg-muted/30'
        }`}>
          <Warehouse size={18} className={wh.isActive ? 'text-primary' : 'text-muted-foreground/60'} />
        </div>
        <div className="flex flex-wrap gap-1 justify-end">
          {wh.isDefault && (
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <Star size={9} className="fill-amber-500" /> Por defecto
            </span>
          )}
          {!wh.isActive && (
            <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Inactivo</span>
          )}
        </div>
      </div>

      <p className="text-[13.5px] font-semibold text-foreground mb-1">{wh.name}</p>

      <div className="space-y-0.5 mt-1">
        {wh.branch && (
          <p className="text-[12px] text-muted-foreground truncate">{wh.branch.name}</p>
        )}
        {wh.address && (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <MapPin size={11} className="shrink-0 text-muted-foreground/60" />
            <span className="truncate">{wh.address}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ── List row ──────────────────────────────────────────────────────────────────

function WarehouseRow({ wh, selected, onClick }: { wh: WarehouseType; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 rounded-xl border bg-card px-5 py-4 cursor-pointer transition-colors hover:border-primary/40 ${
        selected ? 'border-primary/50 bg-primary/5' : 'border-border'
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
        wh.isActive ? 'bg-primary/10' : 'bg-muted/30'
      }`}>
        <Warehouse size={18} className={wh.isActive ? 'text-primary' : 'text-muted-foreground/60'} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13.5px] font-semibold text-foreground">{wh.name}</p>
          {wh.isDefault && (
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <Star size={9} className="fill-amber-500" /> Por defecto
            </span>
          )}
          {!wh.isActive && (
            <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Inactivo</span>
          )}
        </div>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">
          {[wh.branch?.name, wh.address].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WarehousesSettingsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseType | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: warehousesApi.listWarehouses,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: branchesApi.listBranches,
  });

  const panelOpen = showCreate || selectedWarehouse !== null;

  function openWarehouse(w: WarehouseType) { setShowCreate(false); setSelectedWarehouse(w); }
  function openCreate() { setSelectedWarehouse(null); setShowCreate(true); }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Depósitos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestioná los depósitos y almacenes de tu empresa</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-[10px] border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                view === 'grid' ? 'bg-muted/20 text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid size={13} /><span>Grilla</span>
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                view === 'list' ? 'bg-muted/20 text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List size={13} /><span>Lista</span>
            </button>
          </div>
          {/* New button */}
          <Button onClick={openCreate}>
            <Plus size={15} /> Nuevo depósito
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-5">
        {/* Cards / rows */}
        <div className={`min-w-0 flex-1 ${panelOpen ? 'hidden sm:block' : ''}`}>
          {isLoading ? (
            <div className={view === 'grid'
              ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'
              : 'space-y-2'
            }>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={`animate-pulse rounded-[14px] bg-muted/30 ${view === 'grid' ? 'h-36' : 'h-16'}`} />
              ))}
            </div>
          ) : warehouses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Warehouse size={32} className="text-muted-foreground/60 mb-3" />
              <p className="text-sm text-muted-foreground/60">No hay depósitos registrados.</p>
              <button type="button" onClick={openCreate} className="mt-3 text-sm font-medium text-primary hover:underline">
                Crear el primero
              </button>
            </div>
          ) : view === 'grid' ? (
            <div className={`grid gap-3 ${panelOpen ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
              {warehouses.map((w) => (
                <WarehouseCard key={w.id} wh={w} selected={selectedWarehouse?.id === w.id} onClick={() => openWarehouse(w)} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {warehouses.map((w) => (
                <WarehouseRow key={w.id} wh={w} selected={selectedWarehouse?.id === w.id} onClick={() => openWarehouse(w)} />
              ))}
            </div>
          )}
        </div>

        {/* Side panel */}
        {panelOpen && (
          <div className="w-80 shrink-0 overflow-hidden rounded-[14px] border border-border bg-card">
            {showCreate
              ? <WarehouseForm branches={branches} onClose={() => setShowCreate(false)} />
              : selectedWarehouse
                ? <WarehouseForm key={selectedWarehouse.id} initial={selectedWarehouse} branches={branches} onClose={() => setSelectedWarehouse(null)} />
                : null}
          </div>
        )}
      </div>
    </div>
  );
}
