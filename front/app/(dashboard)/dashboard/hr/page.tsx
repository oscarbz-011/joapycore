'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Copy, Check, X, Users2, LayoutGrid, Receipt, Pencil } from 'lucide-react';
import { hrApi, type CreateEmployeePayload, type Employee, type Position } from '../../../../lib/api/hr';
import { NumericInput } from '../../../../components/numeric-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

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

// ── Style constants ────────────────────────────────────────────────────────────

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

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
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
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
    return <Badge variant="destructive">Baja</Badge>;
  }
  return (
    <Badge variant="outline" className="bg-accent-subtle text-accent-on border-accent-on/20">
      Activo
    </Badge>
  );
}

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
  open,
  onOpenChange,
  areas,
  positions,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  areas: Array<{ id: string; name: string }>;
  positions: Position[];
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
      setForm(EMPTY_FORM);
      setCreateAccount(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl p-0 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-card z-10">
          <DialogTitle>Nuevo empleado</DialogTitle>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Personal */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Datos personales</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nombre *</Label>
                <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Apellido *</Label>
                <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Tipo doc. *</Label>
                <Select value={form.documentType} onValueChange={(v) => set('documentType', v as CreateEmployeePayload['documentType'])}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{form.documentType === 'PASSPORT' ? 'Pasaporte' : form.documentType === 'RUC' ? 'RUC' : 'C.I.'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CI">C.I.</SelectItem>
                    <SelectItem value="RUC">RUC</SelectItem>
                    <SelectItem value="PASSPORT">Pasaporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nro. documento *</Label>
                <Input value={form.documentNumber} onChange={(e) => set('documentNumber', e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Fecha de nacimiento *</Label>
                <input type="date" lang="es-PY" className={NUM_CLS} value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Género</Label>
                <Select value={form.gender || 'none'} onValueChange={(v) => set('gender', v === 'none' ? undefined : v as CreateEmployeePayload['gender'])}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{form.gender === 'MASCULINO' ? 'Masculino' : form.gender === 'FEMENINO' ? 'Femenino' : '— Seleccionar —'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Seleccionar —</SelectItem>
                    <SelectItem value="MASCULINO">Masculino</SelectItem>
                    <SelectItem value="FEMENINO">Femenino</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value || undefined)} />
              </div>
              <div className="space-y-1">
                <Label>Celular</Label>
                <Input value={form.mobilePhone ?? ''} onChange={(e) => set('mobilePhone', e.target.value || undefined)} />
              </div>
            </div>
          </div>

          {/* Laboral */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Datos laborales</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Fecha de ingreso *</Label>
                <input type="date" lang="es-PY" className={NUM_CLS} value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Tipo de contrato</Label>
                <Select value={form.contractType ?? 'PERMANENT'} onValueChange={(v) => set('contractType', v as CreateEmployeePayload['contractType'])}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{{ PERMANENT: 'Permanente', TEMPORARY: 'Temporal', PART_TIME: 'Medio tiempo', CONTRACTOR: 'Contratista' }[form.contractType ?? 'PERMANENT']}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERMANENT">Permanente</SelectItem>
                    <SelectItem value="TEMPORARY">Temporal</SelectItem>
                    <SelectItem value="PART_TIME">Medio tiempo</SelectItem>
                    <SelectItem value="CONTRACTOR">Contratista</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Área</Label>
                <Select value={form.areaId || 'none'} onValueChange={(v) => set('areaId', v && v !== 'none' ? v : undefined)}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{areas.find((a) => a.id === form.areaId)?.name ?? '— Sin área —'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin área —</SelectItem>
                    {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Cargo</Label>
                <Select value={form.positionId || 'none'} onValueChange={(v) => set('positionId', v && v !== 'none' ? v : undefined)}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{positions.find((p) => p.id === form.positionId)?.name ?? '— Sin cargo —'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin cargo —</SelectItem>
                    {positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Salario base (PYG) *</Label>
                <NumericInput value={form.baseSalary} onChange={(v) => set('baseSalary', Math.round(v))} className={NUM_CLS} required />
              </div>
              <div className="space-y-1">
                <Label>Forma de pago</Label>
                <Select value={form.paymentMethod ?? 'BANK_TRANSFER'} onValueChange={(v) => set('paymentMethod', v as CreateEmployeePayload['paymentMethod'])}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{form.paymentMethod === 'CASH' ? 'Efectivo' : 'Transferencia bancaria'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK_TRANSFER">Transferencia bancaria</SelectItem>
                    <SelectItem value="CASH">Efectivo</SelectItem>
                  </SelectContent>
                </Select>
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
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-sm font-medium text-muted-foreground">Crear cuenta de acceso al sistema</span>
            </label>
            {createAccount && (
              <div className="mt-3 space-y-3">
                <div className="space-y-1">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => set('email', e.target.value || undefined)}
                    placeholder="empleado@empresa.com"
                    required={createAccount}
                  />
                </div>
                {(form.firstName || form.lastName) && (
                  <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground mb-1">Usuario generado automáticamente</p>
                    <p className="font-mono text-sm font-medium text-foreground">
                      {buildUsernamePreview(form.firstName, form.lastName) || '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground/60">
                      Se agrega un sufijo numérico si el usuario ya existe (ej. jose.benitez2)
                    </p>
                  </div>
                )}
                {(() => {
                  const pos = positions.find((p) => p.id === form.positionId);
                  if (!pos?.role) return null;
                  return (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950">
                      <span className="text-xs text-blue-700 dark:text-blue-300">
                        Se asignará automáticamente el rol <strong>{pos.role.name}</strong> según el cargo seleccionado.
                      </span>
                    </div>
                  );
                })()}
                <p className="text-xs text-muted-foreground">
                  Se generará una contraseña temporal que el empleado deberá cambiar al iniciar sesión.
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando...' : 'Crear empleado'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit employee modal ────────────────────────────────────────────────────────

function EditEmployeeModal({
  employee,
  open,
  onOpenChange,
  areas,
  positions,
  onUpdated,
}: {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  areas: Array<{ id: string; name: string }>;
  positions: Position[];
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();

  const toDateInput = (iso: string | null | undefined) => iso ? iso.slice(0, 10) : '';

  const [form, setForm] = useState<Partial<CreateEmployeePayload>>({});
  const [error, setError] = useState('');
  const [showTerminate, setShowTerminate] = useState(false);
  const [terminationDate, setTerminationDate] = useState('');

  useEffect(() => {
    if (employee) {
      setForm({
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
      setError('');
      setShowTerminate(false);
      setTerminationDate('');
    }
  }, [employee]);

  const set = <K extends keyof CreateEmployeePayload>(k: K, v: CreateEmployeePayload[K] | undefined) =>
    setForm((f) => ({ ...f, [k]: v }));

  const updateMutation = useMutation({
    mutationFn: () => hrApi.updateEmployee(employee!.id, form),
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
    mutationFn: () => hrApi.terminateEmployee(employee!.id, terminationDate || undefined),
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

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl p-0 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-card z-10">
          <div>
            <DialogTitle>{employee.firstName} {employee.lastName}</DialogTitle>
            {employee.employeeCode && (
              <p className="text-xs font-mono text-muted-foreground/60 mt-0.5">{employee.employeeCode}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Personal */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Datos personales</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nombre *</Label>
                <Input value={form.firstName ?? ''} onChange={(e) => set('firstName', e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Apellido *</Label>
                <Input value={form.lastName ?? ''} onChange={(e) => set('lastName', e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Tipo doc. *</Label>
                <Select value={form.documentType ?? 'CI'} onValueChange={(v) => set('documentType', v as CreateEmployeePayload['documentType'])}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{form.documentType === 'PASSPORT' ? 'Pasaporte' : form.documentType === 'RUC' ? 'RUC' : 'C.I.'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CI">C.I.</SelectItem>
                    <SelectItem value="RUC">RUC</SelectItem>
                    <SelectItem value="PASSPORT">Pasaporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nro. documento *</Label>
                <Input value={form.documentNumber ?? ''} onChange={(e) => set('documentNumber', e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Fecha de nacimiento</Label>
                <input type="date" lang="es-PY" className={NUM_CLS} value={form.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value || undefined)} />
              </div>
              <div className="space-y-1">
                <Label>Género</Label>
                <Select value={form.gender || 'none'} onValueChange={(v) => set('gender', v === 'none' ? undefined : v as CreateEmployeePayload['gender'])}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{form.gender === 'MASCULINO' ? 'Masculino' : form.gender === 'FEMENINO' ? 'Femenino' : '— Seleccionar —'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Seleccionar —</SelectItem>
                    <SelectItem value="MASCULINO">Masculino</SelectItem>
                    <SelectItem value="FEMENINO">Femenino</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nacionalidad</Label>
                <Input value={form.nationality ?? ''} onChange={(e) => set('nationality', e.target.value || undefined)} />
              </div>
              <div className="space-y-1">
                <Label>Estado civil</Label>
                <Select value={form.maritalStatus || 'none'} onValueChange={(v) => set('maritalStatus', v && v !== 'none' ? v as CreateEmployeePayload['maritalStatus'] : undefined)}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{{ SINGLE: 'Soltero/a', MARRIED: 'Casado/a', DIVORCED: 'Divorciado/a', WIDOWED: 'Viudo/a', OTHER: 'Otro' }[form.maritalStatus ?? ''] ?? '— Seleccionar —'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Seleccionar —</SelectItem>
                    <SelectItem value="SINGLE">Soltero/a</SelectItem>
                    <SelectItem value="MARRIED">Casado/a</SelectItem>
                    <SelectItem value="DIVORCED">Divorciado/a</SelectItem>
                    <SelectItem value="WIDOWED">Viudo/a</SelectItem>
                    <SelectItem value="OTHER">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value || undefined)} />
              </div>
              <div className="space-y-1">
                <Label>Celular</Label>
                <Input value={form.mobilePhone ?? ''} onChange={(e) => set('mobilePhone', e.target.value || undefined)} />
              </div>
              <div className="space-y-1">
                <Label>Dirección</Label>
                <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value || undefined)} />
              </div>
              <div className="space-y-1">
                <Label>Ciudad</Label>
                <Input value={form.city ?? ''} onChange={(e) => set('city', e.target.value || undefined)} />
              </div>
            </div>
          </div>

          {/* Laboral */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Datos laborales</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Fecha de ingreso *</Label>
                <input type="date" lang="es-PY" className={NUM_CLS} value={form.hireDate ?? ''} onChange={(e) => set('hireDate', e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Tipo de contrato</Label>
                <Select value={form.contractType ?? 'PERMANENT'} onValueChange={(v) => set('contractType', v as CreateEmployeePayload['contractType'])}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{{ PERMANENT: 'Permanente', TEMPORARY: 'Temporal', PART_TIME: 'Medio tiempo', CONTRACTOR: 'Contratista' }[form.contractType ?? 'PERMANENT']}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERMANENT">Permanente</SelectItem>
                    <SelectItem value="TEMPORARY">Temporal</SelectItem>
                    <SelectItem value="PART_TIME">Medio tiempo</SelectItem>
                    <SelectItem value="CONTRACTOR">Contratista</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Área</Label>
                <Select value={form.areaId || 'none'} onValueChange={(v) => set('areaId', v && v !== 'none' ? v : undefined)}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{areas.find((a) => a.id === form.areaId)?.name ?? '— Sin área —'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin área —</SelectItem>
                    {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Cargo</Label>
                <Select value={form.positionId || 'none'} onValueChange={(v) => set('positionId', v && v !== 'none' ? v : undefined)}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{positions.find((p) => p.id === form.positionId)?.name ?? '— Sin cargo —'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin cargo —</SelectItem>
                    {positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Nómina */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Nómina</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Salario base (PYG) *</Label>
                <NumericInput value={form.baseSalary ?? 0} onChange={(v) => set('baseSalary', Math.round(v))} className={NUM_CLS} required />
              </div>
              <div className="space-y-1">
                <Label>Forma de pago</Label>
                <Select value={form.paymentMethod ?? 'BANK_TRANSFER'} onValueChange={(v) => set('paymentMethod', v as CreateEmployeePayload['paymentMethod'])}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{form.paymentMethod === 'CASH' ? 'Efectivo' : 'Transferencia bancaria'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK_TRANSFER">Transferencia bancaria</SelectItem>
                    <SelectItem value="CASH">Efectivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Banco</Label>
                <Input value={form.bankName ?? ''} onChange={(e) => set('bankName', e.target.value || undefined)} />
              </div>
              <div className="space-y-1">
                <Label>Nro. cuenta</Label>
                <Input value={form.bankAccount ?? ''} onChange={(e) => set('bankAccount', e.target.value || undefined)} />
              </div>
            </div>
          </div>

          {/* Baja */}
          {employee.isActive && !employee.terminationDate && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowTerminate((v) => !v)}
                className="text-sm font-medium text-destructive hover:text-destructive/80"
              >
                {showTerminate ? 'Cancelar baja' : 'Dar de baja al empleado'}
              </button>
              {showTerminate && (
                <div className="mt-3 flex items-end gap-3">
                  <div className="flex-1 space-y-1">
                    <Label>Fecha de baja (opcional)</Label>
                    <input type="date" className={NUM_CLS} value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} />
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={terminateMutation.isPending}
                    onClick={() => terminateMutation.mutate()}
                  >
                    {terminateMutation.isPending ? 'Procesando...' : 'Confirmar baja'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Temp password banner ───────────────────────────────────────────────────────

function TempPasswordBanner({ password, onDismiss }: { password: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950">
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Empleado creado con contraseña temporal</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-sm text-amber-900 dark:text-amber-100">{password}</span>
          <button onClick={copy} className="rounded p-1 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900">
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
          <h1 className="text-2xl font-semibold text-foreground">RRHH</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestión de empleados, áreas y nómina</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          Nuevo empleado
        </Button>
      </div>

      <HrNav active="employees" />

      {tempPassword && (
        <TempPasswordBanner password={tempPassword} onDismiss={() => setTempPassword(null)} />
      )}

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Cargando empleados...</div>
      ) : employees.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">No hay empleados registrados.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
          >
            Crear el primero
          </button>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
                  <tr key={emp.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      #{String(emp.employeeNumber).padStart(4, '0')}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {emp.employeeCode ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {emp.firstName} {emp.lastName}
                      </div>
                      {emp.user && (
                        <div className="text-xs text-muted-foreground/60">{emp.user.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="text-xs text-muted-foreground/60">{DOC_LABELS[emp.documentType] ?? emp.documentType} </span>
                      {emp.documentNumber}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{emp.area?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{emp.position?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                      {formatSalary(emp.baseSalary)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {CONTRACT_LABELS[emp.contractType] ?? emp.contractType}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={emp.isActive} terminationDate={emp.terminationDate} />
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditEmployee(emp)}
                        title="Editar empleado"
                        className="h-7 w-7"
                      >
                        <Pencil size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CreateEmployeeModal
        open={showCreate}
        onOpenChange={setShowCreate}
        areas={areas}
        positions={positions}
        onCreated={handleCreated}
      />

      <EditEmployeeModal
        employee={editEmployee}
        open={!!editEmployee}
        onOpenChange={(o) => { if (!o) setEditEmployee(null); }}
        areas={areas}
        positions={positions}
        onUpdated={() => setEditEmployee(null)}
      />
    </div>
  );
}
