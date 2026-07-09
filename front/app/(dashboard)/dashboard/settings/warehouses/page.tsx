'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Star } from 'lucide-react';
import { warehousesApi, type Warehouse, type CreateWarehousePayload } from '../../../../../lib/api/warehouses';
import { branchesApi, type Branch } from '../../../../../lib/api/branches';

const EMPTY_FORM: CreateWarehousePayload = { name: '', address: '', branchId: undefined, isDefault: false };

function fromWarehouse(w: Warehouse): CreateWarehousePayload {
  return { name: w.name, address: w.address ?? '', branchId: w.branchId ?? undefined, isDefault: w.isDefault };
}

function WarehouseForm({
  initial,
  branches,
  onClose,
}: {
  initial?: Warehouse;
  branches: Branch[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateWarehousePayload>(initial ? fromWarehouse(initial) : EMPTY_FORM);
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
      return initial
        ? warehousesApi.updateWarehouse(initial.id, payload)
        : warehousesApi.createWarehouse(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      onClose();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al guardar'));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () => warehousesApi.updateWarehouse(initial!.id, { isActive: !initial!.isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      onClose();
    },
  });

  const inputCls =
    'w-full rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong';
  const labelCls = 'block text-xs font-medium text-muted mb-1';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">
          {initial ? initial.name : 'Nuevo depósito'}
        </h2>
        <button onClick={onClose} className="rounded-md p-1 text-faint hover:bg-surface-2">
          <X size={18} />
        </button>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setError(''); saveMutation.mutate(); }}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
      >
        <div>
          <label className={labelCls}>Nombre *</label>
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            placeholder="Depósito Principal"
          />
        </div>

        <div>
          <label className={labelCls}>Sucursal</label>
          <select
            className={inputCls}
            value={form.branchId ?? ''}
            onChange={(e) => set('branchId', e.target.value || undefined)}
          >
            <option value="">Sin sucursal asignada</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Dirección</label>
          <input
            className={inputCls}
            value={form.address as string}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Av. Industrial 4321"
          />
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isDefault as boolean}
            onChange={(e) => set('isDefault', e.target.checked)}
            className="h-4 w-4 rounded border-border-strong accent-accent"
          />
          <span className="text-sm font-medium text-muted">Depósito por defecto</span>
        </label>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-border">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="flex-1 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear depósito'}
          </button>
        </div>

        {initial && (
          <button
            type="button"
            onClick={() => toggleActiveMutation.mutate()}
            disabled={toggleActiveMutation.isPending}
            className={`w-full rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              initial.isActive
                ? 'border-border text-muted hover:bg-surface-2'
                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            {initial.isActive ? 'Desactivar depósito' : 'Activar depósito'}
          </button>
        )}
      </form>
    </div>
  );
}

export default function WarehousesSettingsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: warehousesApi.listWarehouses,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: branchesApi.listBranches,
  });

  const panelOpen = showCreate || selectedWarehouse !== null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Depósitos</h1>
          <p className="mt-1 text-sm text-muted">Gestioná los depósitos y almacenes de tu empresa</p>
        </div>
        <button
          onClick={() => { setSelectedWarehouse(null); setShowCreate(true); }}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80"
        >
          <Plus size={16} />
          Nuevo depósito
        </button>
      </div>

      <div className="flex gap-6">
        {/* List */}
        <div className={`flex-1 min-w-0 ${panelOpen ? 'hidden sm:block' : ''}`}>
          {isLoading ? (
            <div className="py-16 text-center text-sm text-faint">Cargando depósitos...</div>
          ) : warehouses.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-faint">No hay depósitos registrados.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-3 text-sm font-medium text-ink underline underline-offset-2"
              >
                Crear el primero
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <ul className="divide-y divide-border">
                {warehouses.map((wh) => (
                  <li
                    key={wh.id}
                    onClick={() => { setShowCreate(false); setSelectedWarehouse(wh); }}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-2 transition-colors ${
                      selectedWarehouse?.id === wh.id ? 'bg-surface-2' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {wh.isDefault && (
                        <Star size={13} className="shrink-0 text-amber-500 fill-amber-500" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">{wh.name}</p>
                        <p className="text-xs text-faint truncate">
                          {[wh.branch?.name, wh.address].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    {!wh.isActive && (
                      <span className="ml-3 shrink-0 inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                        Inactivo
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Side panel */}
        {panelOpen && (
          <div className="w-80 shrink-0 rounded-xl border border-border bg-surface overflow-hidden">
            {showCreate ? (
              <WarehouseForm branches={branches} onClose={() => setShowCreate(false)} />
            ) : selectedWarehouse ? (
              <WarehouseForm
                key={selectedWarehouse.id}
                initial={selectedWarehouse}
                branches={branches}
                onClose={() => setSelectedWarehouse(null)}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
