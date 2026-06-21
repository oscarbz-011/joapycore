'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Star } from 'lucide-react';
import { branchesApi, type Branch, type CreateBranchPayload } from '../../../../../lib/api/branches';

const EMPTY_FORM: CreateBranchPayload = { name: '', address: '', phone: '', isMain: false };

function fromBranch(b: Branch): CreateBranchPayload {
  return { name: b.name, address: b.address ?? '', phone: b.phone ?? '', isMain: b.isMain };
}

function BranchForm({ initial, onClose }: { initial?: Branch; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateBranchPayload>(initial ? fromBranch(initial) : EMPTY_FORM);
  const [error, setError] = useState('');

  function set<K extends keyof CreateBranchPayload>(k: K, v: CreateBranchPayload[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: CreateBranchPayload = {
        name: form.name.trim(),
        address: (form.address as string)?.trim() || undefined,
        phone: (form.phone as string)?.trim() || undefined,
        isMain: form.isMain,
      };
      return initial
        ? branchesApi.updateBranch(initial.id, payload)
        : branchesApi.createBranch(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
      onClose();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al guardar'));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () => branchesApi.updateBranch(initial!.id, { isActive: !initial!.isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
      onClose();
    },
  });

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';
  const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">
          {initial ? initial.name : 'Nueva sucursal'}
        </h2>
        <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
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
            placeholder="Sucursal Central"
          />
        </div>

        <div>
          <label className={labelCls}>Dirección</label>
          <input
            className={inputCls}
            value={form.address as string}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Av. Mariscal López 1234, Asunción"
          />
        </div>

        <div>
          <label className={labelCls}>Teléfono</label>
          <input
            className={inputCls}
            value={form.phone as string}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="021 000 000"
          />
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isMain as boolean}
            onChange={(e) => set('isMain', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-slate-900"
          />
          <span className="text-sm font-medium text-slate-700">Sucursal principal</span>
        </label>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear sucursal'}
          </button>
        </div>

        {initial && (
          <button
            type="button"
            onClick={() => toggleActiveMutation.mutate()}
            disabled={toggleActiveMutation.isPending}
            className={`w-full rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              initial.isActive
                ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            {initial.isActive ? 'Desactivar sucursal' : 'Activar sucursal'}
          </button>
        )}
      </form>
    </div>
  );
}

export default function BranchesSettingsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: branchesApi.listBranches,
  });

  const panelOpen = showCreate || selectedBranch !== null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sucursales</h1>
          <p className="mt-1 text-sm text-slate-500">Gestioná las sucursales de tu empresa</p>
        </div>
        <button
          onClick={() => { setSelectedBranch(null); setShowCreate(true); }}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          <Plus size={16} />
          Nueva sucursal
        </button>
      </div>

      <div className="flex gap-6">
        {/* List */}
        <div className={`flex-1 min-w-0 ${panelOpen ? 'hidden sm:block' : ''}`}>
          {isLoading ? (
            <div className="py-16 text-center text-sm text-slate-400">Cargando sucursales...</div>
          ) : branches.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-400">No hay sucursales registradas.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-3 text-sm font-medium text-slate-900 underline underline-offset-2"
              >
                Crear la primera
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-100">
                {branches.map((branch) => (
                  <li
                    key={branch.id}
                    onClick={() => { setShowCreate(false); setSelectedBranch(branch); }}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                      selectedBranch?.id === branch.id ? 'bg-slate-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {branch.isMain && (
                        <Star size={13} className="shrink-0 text-amber-500 fill-amber-500" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{branch.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {[branch.address, branch.phone].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    {!branch.isActive && (
                      <span className="ml-3 shrink-0 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        Inactiva
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
          <div className="w-80 shrink-0 rounded-xl border border-slate-200 bg-white overflow-hidden">
            {showCreate ? (
              <BranchForm onClose={() => setShowCreate(false)} />
            ) : selectedBranch ? (
              <BranchForm
                key={selectedBranch.id}
                initial={selectedBranch}
                onClose={() => setSelectedBranch(null)}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
