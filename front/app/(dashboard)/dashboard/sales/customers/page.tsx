'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ShoppingCart, Users, X, Target } from 'lucide-react';
import {
  salesApi,
  type Customer,
  type CreateCustomerPayload,
  type DocumentType,
} from '../../../../../lib/api/sales';

// ── Sub-nav ────────────────────────────────────────────────────────────────────

function SalesNav() {
  return (
    <div className="flex gap-1 border-b border-border mb-6">
      <Link
        href="/dashboard/sales"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-muted hover:text-ink -mb-px"
      >
        <ShoppingCart size={15} />
        Pedidos
      </Link>
      <Link
        href="/dashboard/sales/customers"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-ink text-ink -mb-px"
      >
        <Users size={15} />
        Clientes
      </Link>
      <Link
        href="/dashboard/sales/targets"
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-muted hover:text-ink -mb-px"
      >
        <Target size={15} />
        Metas
      </Link>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateCustomerPayload = {
  firstName: '',
  secondFirstName: '',
  lastName: '',
  secondLastName: '',
  documentType: undefined,
  documentNumber: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  profession: '',
  monthlyIncome: undefined,
  notes: '',
  homeStreet: '',
  homeNeighborhood: '',
  homeReference: '',
  aptBuilding: '',
  aptFloor: '',
  aptNumber: '',
};

function fromCustomer(c: Customer): CreateCustomerPayload {
  return {
    firstName:       c.firstName,
    secondFirstName: c.secondFirstName ?? '',
    lastName:        c.lastName,
    secondLastName:  c.secondLastName ?? '',
    documentType:    c.documentType ?? undefined,
    documentNumber:  c.documentNumber ?? '',
    email:           c.email ?? '',
    phone:           c.phone ?? '',
    address:         c.address ?? '',
    city:            c.city ?? '',
    profession:      c.profession ?? '',
    monthlyIncome:   c.monthlyIncome ?? undefined,
    notes:           c.notes ?? '',
    homeStreet:       c.homeStreet ?? '',
    homeNeighborhood: c.homeNeighborhood ?? '',
    homeReference:    c.homeReference ?? '',
    aptBuilding:      c.aptBuilding ?? '',
    aptFloor:         c.aptFloor ?? '',
    aptNumber:        c.aptNumber ?? '',
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
        firstName:        form.firstName.trim(),
        secondFirstName:  form.secondFirstName?.trim() || undefined,
        lastName:         form.lastName.trim(),
        secondLastName:   form.secondLastName?.trim() || undefined,
        documentType:     form.documentType || undefined,
        documentNumber:   form.documentNumber?.trim() || undefined,
        email:            form.email?.trim() || undefined,
        phone:            form.phone?.trim() || undefined,
        address:          form.address?.trim() || undefined,
        city:             form.city?.trim() || undefined,
        profession:       form.profession?.trim() || undefined,
        monthlyIncome:    form.monthlyIncome || undefined,
        notes:            form.notes?.trim() || undefined,
        homeStreet:       form.homeStreet?.trim() || undefined,
        homeNeighborhood: form.homeNeighborhood?.trim() || undefined,
        homeReference:    form.homeReference?.trim() || undefined,
        aptBuilding:      form.aptBuilding?.trim() || undefined,
        aptFloor:         form.aptFloor?.trim() || undefined,
        aptNumber:        form.aptNumber?.trim() || undefined,
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
    'w-full rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong';
  const labelCls = 'block text-xs font-medium text-muted mb-1';
  const sectionCls = 'text-xs font-semibold uppercase tracking-wider text-faint mt-5 mb-3';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            {initial ? `${initial.firstName} ${initial.lastName}` : 'Nuevo cliente'}
          </h2>
          {initial?.customerCode && (
            <p className="text-xs text-faint mt-0.5 font-mono">{initial.customerCode}</p>
          )}
          {!initial && (
            <p className="text-xs text-faint mt-0.5">El código se genera automáticamente</p>
          )}
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-faint hover:bg-surface-2">
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
        {/* Datos personales */}
        <p className={sectionCls}>Datos personales</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Primer nombre *</label>
            <input
              className={inputCls}
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              required
              placeholder="María"
            />
          </div>
          <div>
            <label className={labelCls}>Segundo nombre</label>
            <input
              className={inputCls}
              value={form.secondFirstName ?? ''}
              onChange={(e) => set('secondFirstName', e.target.value)}
              placeholder="Isabel"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Primer apellido *</label>
            <input
              className={inputCls}
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              required
              placeholder="González"
            />
          </div>
          <div>
            <label className={labelCls}>Segundo apellido</label>
            <input
              className={inputCls}
              value={form.secondLastName ?? ''}
              onChange={(e) => set('secondLastName', e.target.value)}
              placeholder="Rodríguez"
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
            <label className={labelCls}>Profesión</label>
            <input
              className={inputCls}
              value={form.profession ?? ''}
              onChange={(e) => set('profession', e.target.value)}
              placeholder="Comerciante"
            />
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
        </div>

        {/* Contacto */}
        <p className={sectionCls}>Contacto</p>

        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Ciudad</label>
            <input
              className={inputCls}
              value={form.city ?? ''}
              onChange={(e) => set('city', e.target.value)}
              placeholder="Asunción"
            />
          </div>
          <div>
            <label className={labelCls}>Dirección general</label>
            <input
              className={inputCls}
              value={form.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Av. Mariscal López 1234"
            />
          </div>
        </div>

        {/* Dirección de entrega — Casa */}
        <p className={sectionCls}>Dirección de entrega — Casa</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Calle</label>
            <input
              className={inputCls}
              value={form.homeStreet ?? ''}
              onChange={(e) => set('homeStreet', e.target.value)}
              placeholder="Mcal. López 1234"
            />
          </div>
          <div>
            <label className={labelCls}>Barrio</label>
            <input
              className={inputCls}
              value={form.homeNeighborhood ?? ''}
              onChange={(e) => set('homeNeighborhood', e.target.value)}
              placeholder="Villa Morra"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Referencia</label>
          <input
            className={inputCls}
            value={form.homeReference ?? ''}
            onChange={(e) => set('homeReference', e.target.value)}
            placeholder="Frente al supermercado Buen Precio"
          />
        </div>

        {/* Dirección de entrega — Departamento / Apto */}
        <p className={sectionCls}>Dirección de entrega — Departamento</p>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Edificio</label>
            <input
              className={inputCls}
              value={form.aptBuilding ?? ''}
              onChange={(e) => set('aptBuilding', e.target.value)}
              placeholder="Torre Carmelitas"
            />
          </div>
          <div>
            <label className={labelCls}>Piso</label>
            <input
              className={inputCls}
              value={form.aptFloor ?? ''}
              onChange={(e) => set('aptFloor', e.target.value)}
              placeholder="3"
            />
          </div>
          <div>
            <label className={labelCls}>Nro.</label>
            <input
              className={inputCls}
              value={form.aptNumber ?? ''}
              onChange={(e) => set('aptNumber', e.target.value)}
              placeholder="3B"
            />
          </div>
        </div>

        {/* Notas */}
        <p className={sectionCls}>Notas</p>

        <div>
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

        <div className="flex gap-2 pt-2 border-t border-border">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="flex-1 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50"
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
                    className="flex-1 rounded-lg border border-border-strong bg-surface text-ink px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2"
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
          <h1 className="text-2xl font-semibold text-ink">Ventas</h1>
          <p className="mt-1 text-sm text-muted">Pedidos y clientes</p>
        </div>
        <button
          onClick={() => { setSelectedCustomer(null); setShowCreate(true); }}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80"
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
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="w-full rounded-lg border border-border-strong pl-8 pr-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong"
              placeholder="Buscar por nombre, documento o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-sm text-faint">Cargando clientes...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-faint">No se encontraron clientes.</p>
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
                {filtered.map((customer) => (
                  <li
                    key={customer.id}
                    onClick={() => { setShowCreate(false); setSelectedCustomer(customer); }}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-2 transition-colors ${
                      selectedCustomer?.id === customer.id ? 'bg-surface-2' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-ink truncate">
                          {customer.firstName}
                          {customer.secondFirstName ? ` ${customer.secondFirstName}` : ''}{' '}
                          {customer.lastName}
                          {customer.secondLastName ? ` ${customer.secondLastName}` : ''}
                        </p>
                        {customer.customerCode && (
                          <span className="shrink-0 text-xs text-faint font-mono">
                            {customer.customerCode}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-faint truncate">
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
                      <span className="ml-3 inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted shrink-0">
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
          <div className="w-96 shrink-0 rounded-xl border border-border bg-surface overflow-hidden">
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
