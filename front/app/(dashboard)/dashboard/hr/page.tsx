'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Copy, Check, X, Users2, LayoutGrid, Receipt, Pencil } from 'lucide-react';
import { hrApi, type CreateEmployeePayload, type Employee, type Position } from '../../../../lib/api/hr';
import { NumericInput } from '../../../../components/numeric-input';

function buildUsernamePreview(firstName: string, lastName: string): string {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  return `${norm(firstName)}.${norm(lastName)}`;
}

// ── Label helpers ──────────────────────────────────────────────────────────────

const CONTRACT_LABELS: Record<string, string> = {
  PERMANENT: 'Permanente',
  TEMPORARY: 'Temporal',
  PART_TIME: 'Medio tiempo',
  CONTRACTOR: 'Contratista',
};

const DOC_LABELS: Record<string, string> = {
  CI: 'C.I.',
  RUC: 'RUC',
  PASSPORT: 'Pasaporte',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Transferencia bancaria',
  CASH: 'Efectivo',
};

// ── Sub-nav ────────────────────────────────────────────────────────────────────

function HrNav({ active }: { active: 'employees' | 'areas' | 'payroll' }) {
  const links = [
    { key: 'employees', label: 'Empleados', href: '/dashboard/hr', icon: Users2 },
    { key: 'areas', label: 'Áreas y cargos', href: '/dashboard/hr/areas', icon: LayoutGrid },
    { key: 'payroll', label: 'Nómina', href: '/dashboard/hr/payroll', icon: Receipt },
  ] as const;

  return (
    <div className="flex gap-1 border-b border-border mb-6">
      {links.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            active === key
              ? 'border-ink text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Icon size={15} />
          {label}
        </Link>
      ))}
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ isActive, terminationDate }: { isActive: boolean; terminationDate?: string | null }) {
  if (!isActive || terminationDate) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        Baja
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Activo
    </span>
  );
}

// ── Shared form fields ─────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong';
const labelCls = 'block text-xs font-medium text-muted mb-1';

// ── Create employee modal ──────────────────────────────────────────────────────

const EMPTY_FORM: CreateEmployeePayload = {
  firstName: '',
  lastName: '',
  documentType: 'CI',
  documentNumber: '',
  birthDate: '',
  hireDate: '',
  baseSalary: 0,
  contractType: 'PERMANENT',
  paymentMethod: 'BANK_TRANSFER',
};

function CreateEmployeeModal({
  areas,
  positions,
  onClose,
  onCreated,
}: {
  areas: Array<{ id: string; name: string }>;
  positions: Position[];
  onClose: () => void;
  onCreated: (tempPassword?: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateEmployeePayload>(EMPTY_FORM);
  const [createAccount, setCreateAccount] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof CreateEmployeePayload>(k: K, v: CreateEmployeePayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      hrApi.createEmployee({
        ...form,
        email: createAccount && form.email ? form.email : undefined,
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
      onCreated(data.tempPassword);
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al crear empleado'));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Nuevo empleado</h2>
          <button onClick={onClose} className="rounded-md p-1 text-faint hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Personal */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">Datos personales</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input className={inputCls} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Apellido *</label>
                <input className={inputCls} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Tipo doc. *</label>
                <select className={inputCls} value={form.documentType} onChange={(e) => set('documentType', e.target.value as CreateEmployeePayload['documentType'])}>
                  <option value="CI">C.I.</option>
                  <option value="RUC">RUC</option>
                  <option value="PASSPORT">Pasaporte</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Nro. documento *</label>
                <input className={inputCls} value={form.documentNumber} onChange={(e) => set('documentNumber', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Fecha de nacimiento *</label>
                <input type="date" lang="es-PY" className={inputCls} value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Género</label>
                <select className={inputCls} value={form.gender ?? ''} onChange={(e) => set('gender', (e.target.value as CreateEmployeePayload['gender']) || undefined)}>
                  <option value="">— Seleccionar —</option>
                  <option value="MASCULINO">Masculino</option>
                  <option value="FEMENINO">Femenino</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Teléfono</label>
                <input className={inputCls} value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value || undefined)} />
              </div>
              <div>
                <label className={labelCls}>Celular</label>
                <input className={inputCls} value={form.mobilePhone ?? ''} onChange={(e) => set('mobilePhone', e.target.value || undefined)} />
              </div>
            </div>
          </div>

          {/* Laboral */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">Datos laborales</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Fecha de ingreso *</label>
                <input type="date" lang="es-PY" className={inputCls} value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Tipo de contrato</label>
                <select className={inputCls} value={form.contractType ?? 'PERMANENT'} onChange={(e) => set('contractType', e.target.value as CreateEmployeePayload['contractType'])}>
                  <option value="PERMANENT">Permanente</option>
                  <option value="TEMPORARY">Temporal</option>
                  <option value="PART_TIME">Medio tiempo</option>
                  <option value="CONTRACTOR">Contratista</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Área</label>
                <select className={inputCls} value={form.areaId ?? ''} onChange={(e) => set('areaId', e.target.value || undefined)}>
                  <option value="">— Sin área —</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Cargo</label>
                <select className={inputCls} value={form.positionId ?? ''} onChange={(e) => set('positionId', e.target.value || undefined)}>
                  <option value="">— Sin cargo —</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Salario base (PYG) *</label>
                <NumericInput
                  value={form.baseSalary}
                  onChange={(v) => set('baseSalary', Math.round(v))}
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Forma de pago</label>
                <select className={inputCls} value={form.paymentMethod ?? 'BANK_TRANSFER'} onChange={(e) => set('paymentMethod', e.target.value as CreateEmployeePayload['paymentMethod'])}>
                  <option value="BANK_TRANSFER">Transferencia bancaria</option>
                  <option value="CASH">Efectivo</option>
                </select>
              </div>
            </div>
          </div>

          {/* Cuenta de usuario */}
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={createAccount}
                onChange={(e) => setCreateAccount(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong accent-accent"
              />
              <span className="text-sm font-medium text-muted">Crear cuenta de acceso al sistema</span>
            </label>
            {createAccount && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className={labelCls}>Email *</label>
                  <input
                    type="email"
                    className={inputCls}
                    value={form.email ?? ''}
                    onChange={(e) => set('email', e.target.value || undefined)}
                    placeholder="empleado@empresa.com"
                    required={createAccount}
                  />
                </div>
                {(form.firstName || form.lastName) && (
                  <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                    <p className="text-xs text-muted mb-1">Usuario generado automáticamente</p>
                    <p className="font-mono text-sm font-medium text-ink">
                      {buildUsernamePreview(form.firstName, form.lastName) || '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-faint">
                      Se agrega un sufijo numérico si el usuario ya existe (ej. jose.benitez2)
                    </p>
                  </div>
                )}
                {(() => {
                  const pos = positions.find((p) => p.id === form.positionId);
                  if (!pos?.role) return null;
                  return (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                      <span className="text-xs text-blue-700">
                        Se asignará automáticamente el rol <strong>{pos.role.name}</strong> según el cargo seleccionado.
                      </span>
                    </div>
                  );
                })()}
                <p className="text-xs text-muted">
                  Se generará una contraseña temporal que el empleado deberá cambiar al iniciar sesión.
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="rounded-lg border border-border-strong bg-surface text-ink px-4 py-2 text-sm text-muted hover:bg-surface-2">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50"
            >
              {mutation.isPending ? 'Creando...' : 'Crear empleado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit employee modal ────────────────────────────────────────────────────────

function EditEmployeeModal({
  employee,
  areas,
  positions,
  onClose,
  onUpdated,
}: {
  employee: Employee;
  areas: Array<{ id: string; name: string }>;
  positions: Position[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();

  const toDateInput = (iso: string | null | undefined) =>
    iso ? iso.slice(0, 10) : '';

  const [form, setForm] = useState<Partial<CreateEmployeePayload>>({
    firstName: employee.firstName,
    lastName: employee.lastName,
    documentType: employee.documentType,
    documentNumber: employee.documentNumber,
    birthDate: toDateInput(employee.birthDate),
    gender: employee.gender ?? undefined,
    nationality: employee.nationality ?? undefined,
    maritalStatus: employee.maritalStatus ?? undefined,
    phone: employee.phone ?? undefined,
    mobilePhone: employee.mobilePhone ?? undefined,
    address: employee.address ?? undefined,
    city: employee.city ?? undefined,
    hireDate: toDateInput(employee.hireDate),
    contractType: employee.contractType,
    areaId: employee.area?.id ?? undefined,
    positionId: employee.position?.id ?? undefined,
    baseSalary: employee.baseSalary,
    paymentMethod: employee.paymentMethod,
    bankName: employee.bankName ?? undefined,
    bankAccount: employee.bankAccount ?? undefined,
  });

  const [error, setError] = useState('');
  const [showTerminate, setShowTerminate] = useState(false);
  const [terminationDate, setTerminationDate] = useState('');

  const set = <K extends keyof CreateEmployeePayload>(k: K, v: CreateEmployeePayload[K] | undefined) =>
    setForm((f) => ({ ...f, [k]: v }));

  const updateMutation = useMutation({
    mutationFn: () => hrApi.updateEmployee(employee.id, form),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
      onUpdated();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al actualizar empleado'));
    },
  });

  const terminateMutation = useMutation({
    mutationFn: () => hrApi.terminateEmployee(employee.id, terminationDate || undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
      onUpdated();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al dar de baja'));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    updateMutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">
              {employee.firstName} {employee.lastName}
            </h2>
            {employee.employeeCode && (
              <p className="text-xs font-mono text-faint mt-0.5">{employee.employeeCode}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-faint hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Personal */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">Datos personales</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input className={inputCls} value={form.firstName ?? ''} onChange={(e) => set('firstName', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Apellido *</label>
                <input className={inputCls} value={form.lastName ?? ''} onChange={(e) => set('lastName', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Tipo doc. *</label>
                <select className={inputCls} value={form.documentType ?? 'CI'} onChange={(e) => set('documentType', e.target.value as CreateEmployeePayload['documentType'])}>
                  <option value="CI">C.I.</option>
                  <option value="RUC">RUC</option>
                  <option value="PASSPORT">Pasaporte</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Nro. documento *</label>
                <input className={inputCls} value={form.documentNumber ?? ''} onChange={(e) => set('documentNumber', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Fecha de nacimiento</label>
                <input type="date" lang="es-PY" className={inputCls} value={form.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value || undefined)} />
              </div>
              <div>
                <label className={labelCls}>Género</label>
                <select className={inputCls} value={form.gender ?? ''} onChange={(e) => set('gender', (e.target.value as CreateEmployeePayload['gender']) || undefined)}>
                  <option value="">— Seleccionar —</option>
                  <option value="MASCULINO">Masculino</option>
                  <option value="FEMENINO">Femenino</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Nacionalidad</label>
                <input className={inputCls} value={form.nationality ?? ''} onChange={(e) => set('nationality', e.target.value || undefined)} />
              </div>
              <div>
                <label className={labelCls}>Estado civil</label>
                <select className={inputCls} value={form.maritalStatus ?? ''} onChange={(e) => set('maritalStatus', (e.target.value as CreateEmployeePayload['maritalStatus']) || undefined)}>
                  <option value="">— Seleccionar —</option>
                  <option value="SINGLE">Soltero/a</option>
                  <option value="MARRIED">Casado/a</option>
                  <option value="DIVORCED">Divorciado/a</option>
                  <option value="WIDOWED">Viudo/a</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Teléfono</label>
                <input className={inputCls} value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value || undefined)} />
              </div>
              <div>
                <label className={labelCls}>Celular</label>
                <input className={inputCls} value={form.mobilePhone ?? ''} onChange={(e) => set('mobilePhone', e.target.value || undefined)} />
              </div>
              <div>
                <label className={labelCls}>Dirección</label>
                <input className={inputCls} value={form.address ?? ''} onChange={(e) => set('address', e.target.value || undefined)} />
              </div>
              <div>
                <label className={labelCls}>Ciudad</label>
                <input className={inputCls} value={form.city ?? ''} onChange={(e) => set('city', e.target.value || undefined)} />
              </div>
            </div>
          </div>

          {/* Laboral */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">Datos laborales</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Fecha de ingreso *</label>
                <input type="date" lang="es-PY" className={inputCls} value={form.hireDate ?? ''} onChange={(e) => set('hireDate', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Tipo de contrato</label>
                <select className={inputCls} value={form.contractType ?? 'PERMANENT'} onChange={(e) => set('contractType', e.target.value as CreateEmployeePayload['contractType'])}>
                  <option value="PERMANENT">Permanente</option>
                  <option value="TEMPORARY">Temporal</option>
                  <option value="PART_TIME">Medio tiempo</option>
                  <option value="CONTRACTOR">Contratista</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Área</label>
                <select className={inputCls} value={form.areaId ?? ''} onChange={(e) => set('areaId', e.target.value || undefined)}>
                  <option value="">— Sin área —</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Cargo</label>
                <select className={inputCls} value={form.positionId ?? ''} onChange={(e) => set('positionId', e.target.value || undefined)}>
                  <option value="">— Sin cargo —</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Nómina */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">Nómina</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Salario base (PYG) *</label>
                <NumericInput
                  value={form.baseSalary ?? 0}
                  onChange={(v) => set('baseSalary', Math.round(v))}
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Forma de pago</label>
                <select className={inputCls} value={form.paymentMethod ?? 'BANK_TRANSFER'} onChange={(e) => set('paymentMethod', e.target.value as CreateEmployeePayload['paymentMethod'])}>
                  <option value="BANK_TRANSFER">Transferencia bancaria</option>
                  <option value="CASH">Efectivo</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Banco</label>
                <input className={inputCls} value={form.bankName ?? ''} onChange={(e) => set('bankName', e.target.value || undefined)} />
              </div>
              <div>
                <label className={labelCls}>Nro. cuenta</label>
                <input className={inputCls} value={form.bankAccount ?? ''} onChange={(e) => set('bankAccount', e.target.value || undefined)} />
              </div>
            </div>
          </div>

          {/* Baja */}
          {employee.isActive && !employee.terminationDate && (
            <div className="rounded-xl border border-red-100 bg-red-50/50 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowTerminate((v) => !v)}
                className="text-sm font-medium text-red-600 hover:text-red-700"
              >
                {showTerminate ? 'Cancelar baja' : 'Dar de baja al empleado'}
              </button>
              {showTerminate && (
                <div className="mt-3 flex items-end gap-3">
                  <div className="flex-1">
                    <label className={labelCls}>Fecha de baja (opcional)</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={terminationDate}
                      onChange={(e) => setTerminationDate(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={terminateMutation.isPending}
                    onClick={() => terminateMutation.mutate()}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {terminateMutation.isPending ? 'Procesando...' : 'Confirmar baja'}
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm text-muted hover:bg-surface-2">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Temp password toast ────────────────────────────────────────────────────────

function TempPasswordBanner({ password, onDismiss }: { password: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-800">Empleado creado con contraseña temporal</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-sm text-amber-900">{password}</span>
          <button onClick={copy} className="rounded p-1 text-amber-600 hover:bg-amber-100">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <button onClick={onDismiss} className="text-amber-500 hover:text-amber-700">
        <X size={16} />
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HrEmployeesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['hr-employees'],
    queryFn: hrApi.listEmployees,
  });

  const { data: areas = [] } = useQuery({
    queryKey: ['hr-areas'],
    queryFn: hrApi.listAreas,
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['hr-positions'],
    queryFn: hrApi.listPositions,
  });

  function handleCreated(pw?: string) {
    setShowCreate(false);
    if (pw) setTempPassword(pw);
  }

  function formatSalary(n: number) {
    return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">RRHH</h1>
          <p className="mt-1 text-sm text-muted">Gestión de empleados, áreas y nómina</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80"
        >
          <Plus size={16} />
          Nuevo empleado
        </button>
      </div>

      <HrNav active="employees" />

      {tempPassword && (
        <TempPasswordBanner password={tempPassword} onDismiss={() => setTempPassword(null)} />
      )}

      {isLoading ? (
        <div className="py-16 text-center text-sm text-faint">Cargando empleados...</div>
      ) : employees.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-faint">No hay empleados registrados.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm font-medium text-ink underline underline-offset-2"
          >
            Crear el primero
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Nro.</th>
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Empleado</th>
                <th className="px-4 py-3 text-left">Documento</th>
                <th className="px-4 py-3 text-left">Área</th>
                <th className="px-4 py-3 text-left">Cargo</th>
                <th className="px-4 py-3 text-right">Salario base</th>
                <th className="px-4 py-3 text-left">Contrato</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map((emp: Employee) => (
                <tr key={emp.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    #{String(emp.employeeNumber).padStart(4, '0')}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {emp.employeeCode ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">
                      {emp.firstName} {emp.lastName}
                    </div>
                    {emp.user && (
                      <div className="text-xs text-faint">{emp.user.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <span className="text-xs text-faint">{DOC_LABELS[emp.documentType] ?? emp.documentType} </span>
                    {emp.documentNumber}
                  </td>
                  <td className="px-4 py-3 text-muted">{emp.area?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{emp.position?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted">
                    {formatSalary(emp.baseSalary)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {CONTRACT_LABELS[emp.contractType] ?? emp.contractType}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge isActive={emp.isActive} terminationDate={emp.terminationDate} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditEmployee(emp)}
                      className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-ink transition-colors"
                      title="Editar empleado"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateEmployeeModal
          areas={areas}
          positions={positions}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {editEmployee && (
        <EditEmployeeModal
          employee={editEmployee}
          areas={areas}
          positions={positions}
          onClose={() => setEditEmployee(null)}
          onUpdated={() => setEditEmployee(null)}
        />
      )}
    </div>
  );
}
