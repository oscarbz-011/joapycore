'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ShoppingCart, Users, X } from 'lucide-react';
import {
  salesApi,
  type Customer,
  type CreateCustomerPayload,
  type DocumentType,
} from '../../../../../lib/api/sales';

// ── Sub-nav ────────────────────────────────────────────────────────────────────

function SalesNav() {
  return (
    <div className="flex gap-1 border-b border-slate-200 mb-6">
      <Link
        href="/dashboard/sales"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 -mb-px"
      >
        <ShoppingCart size={15} />
        Pedidos
      </Link>
      <Link
        href="/dashboard/sales/customers"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-slate-900 text-slate-900 -mb-px"
      >
        <Users size={15} />
        Clientes
      </Link>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateCustomerPayload = {
  firstName: '',
  lastName: '',
  customerCode: '',
  documentType: undefined,
  documentNumber: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  profession: '',
  monthlyIncome: undefined,
  notes: '',
};

function fromCustomer(c: Customer): CreateCustomerPayload {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    customerCode: c.customerCode ?? '',
    documentType: c.documentType ?? undefined,
    documentNumber: c.documentNumber ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    address: c.address ?? '',
    city: c.city ?? '',
    profession: c.profession ?? '',
    monthlyIncome: c.monthlyIncome ?? undefined,
    notes: c.notes ?? '',
  };
}

function docLabel(type: DocumentType): string {
  return type === 'CI' ? 'C.I.' : type === 'RUC' ? 'RUC' : 'Pasaporte';
}

// ── Customer form (create / edit) ─────────────────────────────────────────────

function CustomerForm({ initial, onClose }: { initial?: Customer; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateCustomerPayload>(
    initial ? fromCustomer(initial) : EMPTY_FORM,
  );
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof CreateCustomerPayload>(k: K, v: CreateCustomerPayload[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: CreateCustomerPayload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        customerCode: form.customerCode?.trim() || undefined,
        documentType: form.documentType || undefined,
        documentNumber: form.documentNumber?.trim() || undefined,
        email: form.email?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        address: form.address?.trim() || undefined,
        city: form.city?.trim() || undefined,
        profession: form.profession?.trim() || undefined,
        monthlyIncome: form.monthlyIncome || undefined,
        notes: form.notes?.trim() || undefined,
      };
      return initial
        ? salesApi.updateCustomer(initial.id, payload)
        : salesApi.createCustomer(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sale-customers'] });
      onClose();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al guardar'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => salesApi.deleteCustomer(initial!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sale-customers'] });
      onClose();
    },
  });

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';
  const labelCls = 'block text-xs font-medium text-slate-600 mb-1';
  const sectionCls = 'text-xs font-semibold uppercase tracking-wider text-slate-400 mt-5 mb-3';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {initial ? `${initial.firstName} ${initial.lastName}` : 'Nuevo cliente'}
          </h2>
          {initial?.customerCode && (
            <p className="text-xs text-slate-400 mt-0.5">{initial.customerCode}</p>
          )}
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
          <X size={18} />
        </button>
      </div>

      {/* Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          saveMutation.mutate();
        }}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
      >
        {/* Datos básicos */}
        <p className={sectionCls}>Datos personales</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Nombre *</label>
            <input
              className={inputCls}
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              required
              placeholder="María"
            />
          </div>
          <div>
            <label className={labelCls}>Apellido *</label>
            <input
              className={inputCls}
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              required
              placeholder="González"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Tipo de documento</label>
            <select
              className={inputCls}
              value={form.documentType ?? ''}
              onChange={(e) => set('documentType', (e.target.value as DocumentType) || undefined)}
            >
              <option value="">— Seleccionar —</option>
              <option value="CI">C.I.</option>
              <option value="RUC">RUC</option>
              <option value="PASSPORT">Pasaporte</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Número de documento</label>
            <input
              className={inputCls}
              value={form.documentNumber ?? ''}
              onChange={(e) => set('documentNumber', e.target.value)}
              placeholder="1234567-8"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Código de cliente</label>
            <input
              className={inputCls}
              value={form.customerCode ?? ''}
              onChange={(e) => set('customerCode', e.target.value)}
              placeholder="CLI-001"
            />
          </div>
          <div>
            <label className={labelCls}>Profesión</label>
            <input
              className={inputCls}
              value={form.profession ?? ''}
              onChange={(e) => set('profession', e.target.value)}
              placeholder="Comerciante"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Ingresos mensuales (Gs.)</label>
          <input
            type="number"
            min={0}
            className={inputCls}
            value={form.monthlyIncome ?? ''}
            onChange={(e) =>
              set('monthlyIncome', e.target.value ? parseFloat(e.target.value) : undefined)
            }
            placeholder="0"
          />
        </div>

        {/* Contacto */}
        <p className={sectionCls}>Contacto</p>

        <div>
          <label className={labelCls}>Email</label>
          <input
            type="email"
            className={inputCls}
            value={form.email ?? ''}
            onChange={(e) => set('email', e.target.value)}
            placeholder="maria@ejemplo.com"
          />
        </div>

        <div>
          <label className={labelCls}>Teléfono</label>
          <input
            className={inputCls}
            value={form.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="0981 000 000"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Dirección</label>
            <input
              className={inputCls}
              value={form.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Av. Mariscal López 1234"
            />
          </div>
          <div>
            <label className={labelCls}>Ciudad</label>
            <input
              className={inputCls}
              value={form.city ?? ''}
              onChange={(e) => set('city', e.target.value)}
              placeholder="Asunción"
            />
          </div>
        </div>

        {/* Notas */}
        <div>
          <label className={labelCls}>Notas</label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Observaciones sobre el cliente..."
          />
        </div>

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
            {saveMutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>

        {initial && (
          <div className="pt-1">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Eliminar cliente
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
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
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

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['sale-customers'],
    queryFn: salesApi.listCustomers,
  });

  const filtered = customers.filter((c) => {
    const haystack =
      `${c.firstName} ${c.lastName} ${c.email ?? ''} ${c.documentNumber ?? ''} ${c.customerCode ?? ''}`.toLowerCase();
    return !search || haystack.includes(search.toLowerCase());
  });

  const panelOpen = showCreate || selectedCustomer !== null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Ventas</h1>
          <p className="mt-1 text-sm text-slate-500">Pedidos y clientes</p>
        </div>
        <button
          onClick={() => { setSelectedCustomer(null); setShowCreate(true); }}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          <Plus size={16} />
          Nuevo cliente
        </button>
      </div>

      <SalesNav />

      <div className="flex gap-6">
        {/* List */}
        <div className={`flex-1 min-w-0 ${panelOpen ? 'hidden sm:block' : ''}`}>
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              placeholder="Buscar por nombre, documento o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-sm text-slate-400">Cargando clientes...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-400">No se encontraron clientes.</p>
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
                {filtered.map((customer) => (
                  <li
                    key={customer.id}
                    onClick={() => { setShowCreate(false); setSelectedCustomer(customer); }}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                      selectedCustomer?.id === customer.id ? 'bg-slate-50' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 truncate">
                          {customer.firstName} {customer.lastName}
                        </p>
                        {customer.customerCode && (
                          <span className="shrink-0 text-xs text-slate-400 font-mono">
                            {customer.customerCode}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {[
                          customer.documentType && customer.documentNumber
                            ? `${docLabel(customer.documentType)}: ${customer.documentNumber}`
                            : null,
                          customer.phone,
                          customer.email,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    {!customer.isActive && (
                      <span className="ml-3 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 shrink-0">
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
          <div className="w-96 shrink-0 rounded-xl border border-slate-200 bg-white overflow-hidden">
            {showCreate ? (
              <CustomerForm onClose={() => setShowCreate(false)} />
            ) : selectedCustomer ? (
              <CustomerForm
                key={selectedCustomer.id}
                initial={selectedCustomer}
                onClose={() => setSelectedCustomer(null)}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
