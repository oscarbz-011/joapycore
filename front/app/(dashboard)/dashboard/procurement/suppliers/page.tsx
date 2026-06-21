'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Truck, Users, X } from 'lucide-react';
import { procurementApi, type CreateSupplierPayload, type Supplier } from '../../../../../lib/api/procurement';

// ── Sub-nav ────────────────────────────────────────────────────────────────────

function ProcurementNav() {
  return (
    <div className="flex gap-1 border-b border-slate-200 mb-6">
      <Link
        href="/dashboard/procurement"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 -mb-px"
      >
        <Truck size={15} />
        Órdenes de compra
      </Link>
      <Link
        href="/dashboard/procurement/suppliers"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-slate-900 text-slate-900 -mb-px"
      >
        <Users size={15} />
        Proveedores
      </Link>
    </div>
  );
}

// ── Supplier form ──────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateSupplierPayload = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  taxId: '',
  isImporter: false,
};

function fromSupplier(s: Supplier): CreateSupplierPayload {
  return {
    name: s.name,
    contactName: s.contactName ?? '',
    email: s.email ?? '',
    phone: s.phone ?? '',
    address: s.address ?? '',
    taxId: s.taxId ?? '',
    isImporter: s.isImporter,
  };
}

function SupplierForm({
  initial,
  onClose,
}: {
  initial?: Supplier;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateSupplierPayload>(
    initial ? fromSupplier(initial) : EMPTY_FORM,
  );
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof CreateSupplierPayload>(k: K, v: CreateSupplierPayload[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: CreateSupplierPayload = {
        name: form.name.trim(),
        contactName: (form.contactName as string)?.trim() || undefined,
        email: (form.email as string)?.trim() || undefined,
        phone: (form.phone as string)?.trim() || undefined,
        address: (form.address as string)?.trim() || undefined,
        taxId: (form.taxId as string)?.trim() || undefined,
        isImporter: form.isImporter,
      };
      return initial
        ? procurementApi.updateSupplier(initial.id, payload)
        : procurementApi.createSupplier(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      onClose();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al guardar'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => procurementApi.deleteSupplier(initial!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
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
          {initial ? initial.name : 'Nuevo proveedor'}
        </h2>
        <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
          <X size={18} />
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          saveMutation.mutate();
        }}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
      >
        <div>
          <label className={labelCls}>Nombre / Razón social *</label>
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            placeholder="Importadora ABC S.A."
          />
        </div>

        <div>
          <label className={labelCls}>Contacto</label>
          <input
            className={inputCls}
            value={form.contactName as string}
            onChange={(e) => set('contactName', e.target.value)}
            placeholder="Juan Pérez"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Email</label>
            <input
              type="email"
              className={inputCls}
              value={form.email as string}
              onChange={(e) => set('email', e.target.value)}
              placeholder="ventas@proveedor.com"
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>RUC</label>
            <input
              className={inputCls}
              value={form.taxId as string}
              onChange={(e) => set('taxId', e.target.value)}
              placeholder="80012345-6"
            />
          </div>
          <div>
            <label className={labelCls}>Dirección</label>
            <input
              className={inputCls}
              value={form.address as string}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Asunción"
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isImporter as boolean}
            onChange={(e) => set('isImporter', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-slate-900"
          />
          <span className="text-sm font-medium text-slate-700">Es importador</span>
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
            {saveMutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear proveedor'}
          </button>
        </div>

        {initial && (
          <div>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Eliminar proveedor
              </button>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs text-red-700 mb-2">¿Confirmar eliminación?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: procurementApi.listSuppliers,
  });

  const filtered = suppliers.filter((s) => {
    const text = `${s.name} ${s.email ?? ''} ${s.taxId ?? ''} ${s.contactName ?? ''}`.toLowerCase();
    return !search || text.includes(search.toLowerCase());
  });

  const panelOpen = showCreate || selectedSupplier !== null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Compras</h1>
          <p className="mt-1 text-sm text-slate-500">Órdenes de compra y proveedores</p>
        </div>
        <button
          onClick={() => { setSelectedSupplier(null); setShowCreate(true); }}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          <Plus size={16} />
          Nuevo proveedor
        </button>
      </div>

      <ProcurementNav />

      <div className="flex gap-6">
        {/* List */}
        <div className={`flex-1 min-w-0 ${panelOpen ? 'hidden sm:block' : ''}`}>
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              placeholder="Buscar por nombre, email o RUC..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-sm text-slate-400">Cargando proveedores...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-400">No se encontraron proveedores.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-3 text-sm font-medium text-slate-900 underline underline-offset-2"
              >
                Crear el primero
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-100">
                {filtered.map((supplier) => (
                  <li
                    key={supplier.id}
                    onClick={() => { setShowCreate(false); setSelectedSupplier(supplier); }}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                      selectedSupplier?.id === supplier.id ? 'bg-slate-50' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 truncate">{supplier.name}</p>
                        {supplier.isImporter && (
                          <span className="inline-flex shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700">
                            Importador
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {[
                          supplier.contactName,
                          supplier.email,
                          supplier.taxId ? `RUC: ${supplier.taxId}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    {!supplier.isActive && (
                      <span className="ml-3 shrink-0 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
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
          <div className="w-80 shrink-0 rounded-xl border border-slate-200 bg-white overflow-hidden">
            {showCreate ? (
              <SupplierForm onClose={() => setShowCreate(false)} />
            ) : selectedSupplier ? (
              <SupplierForm
                key={selectedSupplier.id}
                initial={selectedSupplier}
                onClose={() => setSelectedSupplier(null)}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
