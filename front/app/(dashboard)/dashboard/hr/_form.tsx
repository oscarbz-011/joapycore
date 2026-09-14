'use client';

import { usePermission } from '@/lib/permissions';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import {
  hrApi,
  type CreateEmployeePayload,
  type DocumentType,
  type Employee,
} from '../../../../lib/api/hr';
import { branchesApi } from '../../../../lib/api/branches';
import { NumericInput } from '../../../../components/numeric-input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// ── Constants ─────────────────────────────────────────────────────────────────

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';
const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';

const DOC_LABELS: Record<DocumentType, string> = { CI: 'C.I.', RUC: 'RUC', PASSPORT: 'Pasaporte' };
const CONTRACT_LABELS: Record<string, string> = {
  PERMANENT: 'Permanente', TEMPORARY: 'Temporal', PART_TIME: 'Medio tiempo', CONTRACTOR: 'Contratista',
};
const MARITAL_LABELS: Record<string, string> = {
  SINGLE: 'Soltero/a', MARRIED: 'Casado/a', DIVORCED: 'Divorciado/a', WIDOWED: 'Viudo/a', OTHER: 'Otro',
};

const EMPTY_FORM: CreateEmployeePayload = {
  firstName: '', lastName: '', documentType: 'CI', documentNumber: '',
  birthDate: '', gender: undefined, nationality: '', maritalStatus: undefined,
  phone: '', mobilePhone: '', address: '', city: '',
  hireDate: '', contractType: 'PERMANENT', isCourier: false, areaId: undefined, positionId: undefined,
  branchId: undefined,
  baseSalary: 0, paymentMethod: 'BANK_TRANSFER', bankName: '', bankAccount: '',
};

function toDateInput(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10) : '';
}

function fromEmployee(e: Employee): CreateEmployeePayload {
  return {
    firstName: e.firstName,
    lastName: e.lastName,
    documentType: e.documentType,
    documentNumber: e.documentNumber,
    birthDate: toDateInput(e.birthDate),
    gender: e.gender ?? undefined,
    nationality: e.nationality ?? '',
    maritalStatus: e.maritalStatus ?? undefined,
    phone: e.phone ?? '',
    mobilePhone: e.mobilePhone ?? '',
    address: e.address ?? '',
    city: e.city ?? '',
    hireDate: toDateInput(e.hireDate),
    contractType: e.contractType,
    isCourier: e.isCourier,
    areaId: e.area?.id ?? undefined,
    positionId: e.position?.id ?? undefined,
    branchId: e.branch?.id ?? undefined,
    baseSalary: e.baseSalary,
    paymentMethod: e.paymentMethod,
    bankName: e.bankName ?? '',
    bankAccount: e.bankAccount ?? '',
  };
}

function buildUsernamePreview(firstName: string, lastName: string): string {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  return `${norm(firstName)}.${norm(lastName)}`;
}

// ── Temp password panel ──────────────────────────────────────────────────────

function TempPasswordPanel({ password, onContinue }: { password: string; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950">
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Empleado creado con contraseña temporal
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-sm text-amber-900 dark:text-amber-100">{password}</span>
            <button type="button" onClick={copy} className="rounded p-1 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/70">
            Guardala ahora — no se va a volver a mostrar. El empleado deberá cambiarla al iniciar sesión.
          </p>
        </div>
      </div>
      <Button className="mt-4" onClick={onContinue}>Ir a empleados</Button>
    </div>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

interface Props {
  initial?: Employee;
  onDone: () => void;
}

export function EmployeeForm({ initial, onDone }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateEmployeePayload>(initial ? fromEmployee(initial) : EMPTY_FORM);
  const [createAccount, setCreateAccount] = useState(false);
  const [error, setError] = useState('');
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [terminationDate, setTerminationDate] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const { data: areas = [] } = useQuery({ queryKey: ['hr-areas'], queryFn: hrApi.listAreas });
  const { data: positions = [] } = useQuery({ queryKey: ['hr-positions'], queryFn: hrApi.listPositions });
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: branchesApi.listBranches });

  function set<K extends keyof CreateEmployeePayload>(k: K, v: CreateEmployeePayload[K] | undefined) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Al crear (no al editar), precarga la sucursal principal apenas cargan
  // las sucursales — reduce fricción cuando solo existe la Casa Matriz,
  // queda editable si el tenant ya tiene más de una.
  const [branchDefaulted, setBranchDefaulted] = useState(false);
  if (!initial && !branchDefaulted && branches.length > 0) {
    setBranchDefaulted(true);
    const main = branches.find((b) => b.isMain) ?? branches[0];
    if (main && !form.branchId) set('branchId', main.id);
  }

  const canTerminate = usePermission('hr:employees:terminate');

  const saveMutation = useMutation<Employee | { employee: Employee; tempPassword?: string }, Error, void>({
    mutationFn: () => {
      const payload: CreateEmployeePayload = {
        ...form,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        documentNumber: form.documentNumber.trim(),
        nationality: form.nationality?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        mobilePhone: form.mobilePhone?.trim() || undefined,
        address: form.address?.trim() || undefined,
        city: form.city?.trim() || undefined,
        bankName: form.bankName?.trim() || undefined,
        bankAccount: form.bankAccount?.trim() || undefined,
        email: !initial && createAccount && form.email ? form.email.trim() : undefined,
      };
      return initial
        ? hrApi.updateEmployee(initial.id, payload)
        : hrApi.createEmployee(payload);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
      if (!initial && 'tempPassword' in data && data.tempPassword) {
        setTempPassword(data.tempPassword);
        return;
      }
      onDone();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al guardar'));
    },
  });

  const terminateMutation = useMutation({
    mutationFn: () => hrApi.terminateEmployee(initial!.id, terminationDate || undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
      onDone();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al dar de baja'));
    },
  });

  if (tempPassword) {
    return <TempPasswordPanel password={tempPassword} onContinue={onDone} />;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        saveMutation.mutate();
      }}
    >
      <div className="rounded-xl border border-border bg-card overflow-hidden">

        {/* Datos personales */}
        <section className="p-6 space-y-4">
          <p className={SECTION_LABEL}>Datos personales</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required placeholder="José" />
            </div>
            <div className="space-y-1.5">
              <Label>Apellido <span className="text-destructive">*</span></Label>
              <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required placeholder="Benítez" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de documento <span className="text-destructive">*</span></Label>
              <Select value={form.documentType} onValueChange={(v) => v && set('documentType', v as DocumentType)}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">{DOC_LABELS[form.documentType]}</span>
                </SelectTrigger>
                <SelectContent>
                  {(['CI', 'RUC', 'PASSPORT'] as DocumentType[]).map((t) => (
                    <SelectItem key={t} value={t}>{DOC_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Número de documento <span className="text-destructive">*</span></Label>
              <Input value={form.documentNumber} onChange={(e) => set('documentNumber', e.target.value)} required placeholder="1234567" />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de nacimiento <span className="text-destructive">*</span></Label>
              <DatePicker value={form.birthDate} onChange={(v) => set('birthDate', v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Género</Label>
              <Select value={form.gender ?? 'none'} onValueChange={(v) => set('gender', v && v !== 'none' ? v as CreateEmployeePayload['gender'] : undefined)}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">
                    {form.gender === 'MASCULINO' ? 'Masculino' : form.gender === 'FEMENINO' ? 'Femenino' : '— Seleccionar —'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seleccionar —</SelectItem>
                  <SelectItem value="MASCULINO">Masculino</SelectItem>
                  <SelectItem value="FEMENINO">Femenino</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nacionalidad</Label>
              <Input value={form.nationality ?? ''} onChange={(e) => set('nationality', e.target.value)} placeholder="Paraguaya" />
            </div>
            <div className="space-y-1.5">
              <Label>Estado civil</Label>
              <Select value={form.maritalStatus ?? 'none'} onValueChange={(v) => set('maritalStatus', v && v !== 'none' ? v as CreateEmployeePayload['maritalStatus'] : undefined)}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">
                    {form.maritalStatus ? MARITAL_LABELS[form.maritalStatus] : '— Seleccionar —'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seleccionar —</SelectItem>
                  {Object.entries(MARITAL_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="021 000 000" />
            </div>
            <div className="space-y-1.5">
              <Label>Celular</Label>
              <Input value={form.mobilePhone ?? ''} onChange={(e) => set('mobilePhone', e.target.value)} placeholder="0981 000 000" />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Av. Mariscal López 1234" />
            </div>
            <div className="space-y-1.5">
              <Label>Ciudad</Label>
              <Input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} placeholder="Asunción" />
            </div>
          </div>
        </section>

        {/* Datos laborales */}
        <section className="p-6 space-y-4 border-t border-border">
          <p className={SECTION_LABEL}>Datos laborales</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Fecha de ingreso <span className="text-destructive">*</span></Label>
              <DatePicker value={form.hireDate} onChange={(v) => set('hireDate', v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de contrato</Label>
              <Select value={form.contractType ?? 'PERMANENT'} onValueChange={(v) => v && set('contractType', v as CreateEmployeePayload['contractType'])}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">{CONTRACT_LABELS[form.contractType ?? 'PERMANENT']}</span>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTRACT_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Área</Label>
              <Select value={form.areaId ?? 'none'} onValueChange={(v) => set('areaId', v && v !== 'none' ? v : undefined)}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">{areas.find((a) => a.id === form.areaId)?.name ?? '— Sin área —'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin área —</SelectItem>
                  {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <Select value={form.positionId ?? 'none'} onValueChange={(v) => set('positionId', v && v !== 'none' ? v : undefined)}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">{positions.find((p) => p.id === form.positionId)?.name ?? '— Sin cargo —'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin cargo —</SelectItem>
                  {positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sucursal</Label>
              <Select value={form.branchId ?? 'none'} onValueChange={(v) => set('branchId', v && v !== 'none' ? v : undefined)}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">{branches.find((b) => b.id === form.branchId)?.name ?? '— Sin sucursal —'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin sucursal —</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={form.isCourier ?? false}
              onChange={(e) => set('isCourier', e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-sm font-medium text-foreground">Repartidor</span>
          </label>
          <p className="ml-[26px] -mt-2 text-xs text-muted-foreground/70">
            Aparece como opción al asignar entregas en Logística — no marcar para vendedores, analistas u otro personal que no reparte.
          </p>
        </section>

        {/* Nómina */}
        <section className="p-6 space-y-4 border-t border-border">
          <p className={SECTION_LABEL}>Nómina</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Salario base (PYG) <span className="text-destructive">*</span></Label>
              <NumericInput value={form.baseSalary} onChange={(v) => set('baseSalary', Math.round(v))} className={NUM_CLS} required />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de pago</Label>
              <Select value={form.paymentMethod ?? 'BANK_TRANSFER'} onValueChange={(v) => v && set('paymentMethod', v as CreateEmployeePayload['paymentMethod'])}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">{form.paymentMethod === 'CASH' ? 'Efectivo' : 'Transferencia bancaria'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_TRANSFER">Transferencia bancaria</SelectItem>
                  <SelectItem value="CASH">Efectivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Input value={form.bankName ?? ''} onChange={(e) => set('bankName', e.target.value)} placeholder="Banco Itaú" />
            </div>
            <div className="space-y-1.5">
              <Label>Número de cuenta</Label>
              <Input value={form.bankAccount ?? ''} onChange={(e) => set('bankAccount', e.target.value)} placeholder="0000-000000" />
            </div>
          </div>
        </section>

        {/* Cuenta de usuario — solo al crear */}
        {!initial && (
          <section className="p-6 space-y-3 border-t border-border">
            <p className={SECTION_LABEL}>Cuenta de acceso al sistema</p>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={createAccount}
                onChange={(e) => setCreateAccount(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-sm font-medium text-foreground">Crear cuenta de acceso al sistema</span>
            </label>
            {createAccount && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Email <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => set('email', e.target.value)}
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
          </section>
        )}

        {/* Baja — solo al editar y con permiso */}
        {initial && initial.isActive && !initial.terminationDate && canTerminate && (
          <section className="p-6 border-t border-border">
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
              <button
                type="button"
                onClick={() => setConfirmTerminate((v) => !v)}
                className="text-sm font-medium text-destructive hover:text-destructive/80"
              >
                {confirmTerminate ? 'Cancelar baja' : 'Dar de baja al empleado'}
              </button>
              {confirmTerminate && (
                <div className="mt-3 flex items-end gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label>Fecha de baja (opcional)</Label>
                    <DatePicker value={terminationDate} onChange={(v) => setTerminationDate(v)} />
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
          </section>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4 bg-muted/10">
          <div className="flex-1 min-w-0">
            {error && <p className="text-sm text-destructive truncate">{error}</p>}
          </div>

          <Button type="submit" disabled={saveMutation.isPending} className="shrink-0">
            {saveMutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear empleado'}
          </Button>
        </div>
      </div>
    </form>
  );
}
