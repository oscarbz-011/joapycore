'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantsApi, type UpdateTenantPayload } from '../../../../../lib/api/tenants';
import { useAuth } from '../../../../../lib/auth-context';

const EMPLOYEE_RANGES = [
  { value: 'RANGE_1_5',    label: '1 – 5' },
  { value: 'RANGE_6_20',   label: '6 – 20' },
  { value: 'RANGE_21_50',  label: '21 – 50' },
  { value: 'RANGE_51_200', label: '51 – 200' },
  { value: 'RANGE_201',    label: '201+' },
] as const;

const CURRENCIES = [
  { value: 'PYG', label: 'PYG – Guaraní' },
  { value: 'USD', label: 'USD – Dólar' },
  { value: 'BRL', label: 'BRL – Real' },
  { value: 'ARS', label: 'ARS – Peso Argentino' },
  { value: 'EUR', label: 'EUR – Euro' },
];

const inputClass =
  'w-full rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm text-ink outline-none transition focus:border-border-strong focus:ring-1 focus:ring-border-strong disabled:bg-surface-2 disabled:text-faint disabled:cursor-not-allowed';

type FormState = {
  name: string;
  razonSocial: string;
  ruc: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  department: string;
  country: string;
  employeeCount: string;
  currency: string;
};

function fromTenant(t: Awaited<ReturnType<typeof tenantsApi.getMe>>): FormState {
  return {
    name:          t.name ?? '',
    razonSocial:   t.razonSocial ?? '',
    ruc:           t.ruc ?? '',
    email:         t.email ?? '',
    phone:         t.phone ?? '',
    address:       t.address ?? '',
    postalCode:    t.postalCode ?? '',
    city:          t.city ?? '',
    department:    t.department ?? '',
    country:       t.country ?? 'Paraguay',
    employeeCount: t.employeeCount ?? 'RANGE_1_5',
    currency:      t.currency ?? 'PYG',
  };
}

export default function TenantPage() {
  const queryClient = useQueryClient();
  const { jwtPayload } = useAuth();
  const canEdit = jwtPayload?.permissions.includes('tenants:update') ?? false;

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant'],
    queryFn: tenantsApi.getMe,
  });

  const [form, setForm] = useState<FormState>({
    name: '', razonSocial: '', ruc: '', email: '', phone: '',
    address: '', postalCode: '', city: '', department: '',
    country: 'Paraguay', employeeCount: 'RANGE_1_5', currency: 'PYG',
  });

  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (tenant) setForm(fromTenant(tenant));
  }, [tenant]);

  const isDirty = tenant
    ? JSON.stringify(form) !== JSON.stringify(fromTenant(tenant))
    : false;

  const mutation = useMutation({
    mutationFn: () => {
      const payload: UpdateTenantPayload = {
        name:          form.name || undefined,
        razonSocial:   form.razonSocial || undefined,
        ruc:           form.ruc || undefined,
        email:         form.email || undefined,
        phone:         form.phone || undefined,
        address:       form.address || undefined,
        postalCode:    form.postalCode || undefined,
        city:          form.city || undefined,
        department:    form.department || undefined,
        country:       form.country || undefined,
        employeeCount: form.employeeCount as UpdateTenantPayload['employeeCount'],
        currency:      form.currency || undefined,
      };
      return tenantsApi.updateMe(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant'] });
      setSuccess(true);
      setServerError('');
      setTimeout(() => setSuccess(false), 2500);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      setServerError(err?.response?.data?.message ?? 'Error al guardar');
    },
  });

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  if (isLoading) {
    return <div className="p-6 text-sm text-muted">Cargando...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Mi empresa</h1>
        <p className="mt-1 text-sm text-muted">
          Información legal y de contacto de tu organización.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setServerError('');
          mutation.mutate();
        }}
        className="space-y-6"
      >
        {/* Datos de la empresa */}
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-4 text-sm font-semibold text-ink">Datos de la empresa</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Nombre comercial
                </label>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={set('name')}
                  disabled={!canEdit}
                  placeholder="Mi Empresa S.A."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Razón social
                </label>
                <input
                  className={inputClass}
                  value={form.razonSocial}
                  onChange={set('razonSocial')}
                  disabled={!canEdit}
                  placeholder="Mi Empresa Sociedad Anónima"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">RUC</label>
                <input
                  className={inputClass}
                  value={form.ruc}
                  onChange={set('ruc')}
                  disabled={!canEdit}
                  placeholder="80012345-6"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Plan
                </label>
                <input
                  className={inputClass}
                  value={tenant?.plan ?? ''}
                  disabled
                  readOnly
                />
              </div>
            </div>
          </div>
        </section>

        {/* Contacto y ubicación */}
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-4 text-sm font-semibold text-ink">Contacto y ubicación</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Email</label>
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={set('email')}
                  disabled={!canEdit}
                  placeholder="contacto@empresa.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Teléfono</label>
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={set('phone')}
                  disabled={!canEdit}
                  placeholder="+595 21 000 0000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">Dirección</label>
              <input
                className={inputClass}
                value={form.address}
                onChange={set('address')}
                disabled={!canEdit}
                placeholder="Av. Mcal. López 123"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Ciudad</label>
                <input
                  className={inputClass}
                  value={form.city}
                  onChange={set('city')}
                  disabled={!canEdit}
                  placeholder="Asunción"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Departamento</label>
                <input
                  className={inputClass}
                  value={form.department}
                  onChange={set('department')}
                  disabled={!canEdit}
                  placeholder="Central"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Código postal</label>
                <input
                  className={inputClass}
                  value={form.postalCode}
                  onChange={set('postalCode')}
                  disabled={!canEdit}
                  placeholder="1001"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">País</label>
                <input
                  className={inputClass}
                  value={form.country}
                  onChange={set('country')}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Configuración operacional */}
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-4 text-sm font-semibold text-ink">Configuración</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Tamaño</label>
              <select
                className={inputClass}
                value={form.employeeCount}
                onChange={set('employeeCount')}
                disabled={!canEdit}
              >
                {EMPLOYEE_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label} empleados</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Moneda base</label>
              <select
                className={inputClass}
                value={form.currency}
                onChange={set('currency')}
                disabled={!canEdit}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {canEdit && (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!isDirty || mutation.isPending}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
            {success && <span className="text-sm text-green-600">Cambios guardados</span>}
            {serverError && <span className="text-sm text-red-600">{serverError}</span>}
          </div>
        )}
      </form>
    </div>
  );
}
