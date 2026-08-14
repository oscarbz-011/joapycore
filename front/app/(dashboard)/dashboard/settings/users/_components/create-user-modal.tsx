'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Copy, Check } from 'lucide-react';
import { usersApi, type CreateUserPayload } from '../../../../../../lib/api/users';
import { hrApi, type CreateEmployeePayload } from '../../../../../../lib/api/hr';
import { NumericInput } from '../../../../../../components/numeric-input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// ── Username preview ──────────────────────────────────────────────────────────

function buildUsernamePreview(firstName: string, lastName: string): string {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const f = norm(firstName);
  const l = norm(lastName);
  return f && l ? `${f}.${l}` : f || l || '';
}

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  firstName: z.string().min(1, 'Requerido'),
  lastName: z.string().min(1, 'Requerido'),
  email: z.string().email('Email inválido'),
  roleIds: z.array(z.string()).optional(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_EMPLOYMENT: Pick<
  CreateEmployeePayload,
  'documentType' | 'documentNumber' | 'birthDate' | 'hireDate' | 'baseSalary' | 'areaId' | 'positionId' | 'contractType'
> = {
  documentType: 'CI',
  documentNumber: '',
  birthDate: '',
  hireDate: '',
  baseSalary: 0,
  contractType: 'PERMANENT',
};

interface Props {
  onClose: () => void;
}

const inputClass =
  'w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm placeholder:text-muted-foreground/60 outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30';
const labelClass = 'mb-1.5 block text-xs font-medium text-muted-foreground';

export function CreateUserModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const overlayRef = useRef<HTMLDivElement>(null);

  const [isEmployee, setIsEmployee] = useState(false);
  const [employment, setEmployment] = useState(EMPTY_EMPLOYMENT);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: usersApi.listRoles });
  const { data: areas = [] } = useQuery({ queryKey: ['hr-areas'], queryFn: hrApi.listAreas });
  const { data: positions = [] } = useQuery({ queryKey: ['hr-positions'], queryFn: hrApi.listPositions });

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', email: '', roleIds: [] },
  });

  const firstName = watch('firstName');
  const lastName = watch('lastName');
  const usernamePreview = buildUsernamePreview(firstName, lastName);

  const setEmp = <K extends keyof typeof EMPTY_EMPLOYMENT>(k: K, v: (typeof EMPTY_EMPLOYMENT)[K]) =>
    setEmployment((e) => ({ ...e, [k]: v }));

  // ── Mutations ───────────────────────────────────────────────────────────────

  const createUserMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: CreateUserPayload = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
      };
      const user = await usersApi.create(payload);
      if (values.roleIds && values.roleIds.length > 0) {
        await usersApi.assignRoles(user.id, values.roleIds);
      }
      return user;
    },
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      if (user.tempPassword) {
        setTempPassword(user.tempPassword);
      } else {
        onClose();
      }
    },
    onError: (err: { message?: string }) => {
      setError('root', { message: err?.message ?? 'Error al crear el usuario' });
    },
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!employment.documentNumber || !employment.birthDate || !employment.hireDate || !employment.baseSalary) {
        throw new Error('Completá los datos de empleado requeridos');
      }
      const result = await hrApi.createEmployee({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        documentType: employment.documentType,
        documentNumber: employment.documentNumber,
        birthDate: employment.birthDate,
        hireDate: employment.hireDate,
        baseSalary: employment.baseSalary,
        contractType: employment.contractType,
        areaId: employment.areaId,
        positionId: employment.positionId,
      });
      if (values.roleIds && values.roleIds.length > 0 && result.employee.user?.id) {
        await usersApi.assignRoles(result.employee.user.id, values.roleIds);
      }
      return result;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
      if (data.tempPassword) {
        setTempPassword(data.tempPassword);
      } else {
        onClose();
      }
    },
    onError: (err: { message?: string }) => {
      setError('root', { message: err?.message ?? 'Error al crear el empleado' });
    },
  });

  function onSubmit(values: FormValues) {
    if (isEmployee) {
      createEmployeeMutation.mutate(values);
    } else {
      createUserMutation.mutate(values);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Temp password screen ────────────────────────────────────────────────────

  if (tempPassword) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-card shadow-xl p-6 space-y-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mx-auto">
            <span className="text-2xl">🔑</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Usuario creado con éxito</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Contraseña temporal válida por <strong>24 horas</strong>. El usuario deberá cambiarla al iniciar sesión.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <span className="font-mono text-sm font-semibold text-amber-900">{tempPassword}</span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(tempPassword);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="ml-3 text-amber-600 hover:text-amber-800"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            También podés consultarla en el detalle del usuario mientras esté vigente.
          </p>
          <Button className="w-full" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    );
  }

  // ── Main modal ──────────────────────────────────────────────────────────────

  const selectedPosition = positions.find((p) => p.id === employment.positionId);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Nuevo usuario</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted/20 hover:text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-6 py-5">

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Nombre</label>
              <input {...register('firstName')} className={inputClass} placeholder="Juan" />
              {errors.firstName && <p className="mt-1 text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Apellido</label>
              <input {...register('lastName')} className={inputClass} placeholder="García" />
              {errors.lastName && <p className="mt-1 text-xs text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>

          {/* Username preview */}
          {usernamePreview && (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground/60">Usuario generado automáticamente</p>
              <p className="mt-0.5 font-mono text-sm font-medium text-foreground">{usernamePreview}</p>
            </div>
          )}

          {/* Email */}
          <div>
            <label className={labelClass}>Email</label>
            <input {...register('email')} type="email" className={inputClass} placeholder="usuario@empresa.com" />
            {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
          </div>

          {/* Password info */}
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">
              La contraseña temporal se generará automáticamente y se mostrará al finalizar. Válida por 24 horas.
            </p>
          </div>

          {/* Roles */}
          {roles.length > 0 && (
            <div>
              <label className={labelClass}>Rol {isEmployee ? '(opcional, adicional al del cargo)' : '(opcional)'}</label>
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                {roles.map((role) => (
                  <label key={role.id} className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      value={role.id}
                      {...register('roleIds')}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <span className="text-sm text-muted-foreground">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Employee toggle */}
          <div className="rounded-xl border border-border overflow-hidden">
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
              <input
                type="checkbox"
                checked={isEmployee}
                onChange={(e) => { setIsEmployee(e.target.checked); setEmployment(EMPTY_EMPLOYMENT); }}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground">También es empleado de la empresa</p>
                <p className="text-xs text-muted-foreground/60">Crea simultáneamente su ficha de empleado en RRHH</p>
              </div>
            </label>

            {isEmployee && (
              <div className="border-t border-border bg-muted/30 px-4 py-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Datos laborales</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Tipo doc. *</label>
                    <Select value={employment.documentType} onValueChange={(v) => v && setEmp('documentType', v as typeof employment.documentType)}>
                      <SelectTrigger className="w-full">
                        <span className="flex-1 text-left text-sm truncate">{{ CI: 'C.I.', RUC: 'RUC', PASSPORT: 'Pasaporte' }[employment.documentType]}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CI">C.I.</SelectItem>
                        <SelectItem value="RUC">RUC</SelectItem>
                        <SelectItem value="PASSPORT">Pasaporte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className={labelClass}>Nro. documento *</label>
                    <input
                      value={employment.documentNumber}
                      onChange={(e) => setEmp('documentNumber', e.target.value)}
                      className={inputClass}
                      placeholder="12345678"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Fecha de nacimiento *</label>
                    <input
                      type="date"
                      value={employment.birthDate}
                      onChange={(e) => setEmp('birthDate', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Fecha de ingreso *</label>
                    <input
                      type="date"
                      value={employment.hireDate}
                      onChange={(e) => setEmp('hireDate', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Salario base (PYG) *</label>
                    <NumericInput
                      value={employment.baseSalary}
                      onChange={(v) => setEmp('baseSalary', Math.round(v))}
                      className={inputClass}
                      placeholder="2.800.000"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Tipo de contrato</label>
                    <Select value={employment.contractType ?? 'PERMANENT'} onValueChange={(v) => v && setEmp('contractType', v as typeof employment.contractType)}>
                      <SelectTrigger className="w-full">
                        <span className="flex-1 text-left text-sm truncate">{{ PERMANENT: 'Permanente', TEMPORARY: 'Temporal', PART_TIME: 'Medio tiempo', CONTRACTOR: 'Contratista' }[employment.contractType ?? 'PERMANENT']}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERMANENT">Permanente</SelectItem>
                        <SelectItem value="TEMPORARY">Temporal</SelectItem>
                        <SelectItem value="PART_TIME">Medio tiempo</SelectItem>
                        <SelectItem value="CONTRACTOR">Contratista</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className={labelClass}>Área</label>
                    <Select value={employment.areaId || 'none'} onValueChange={(v) => setEmp('areaId', v && v !== 'none' ? v : undefined)}>
                      <SelectTrigger className="w-full">
                        <span className="flex-1 text-left text-sm truncate">{areas.find((a) => a.id === employment.areaId)?.name ?? '— Sin área —'}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Sin área —</SelectItem>
                        {areas.filter((a) => a.isActive).map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className={labelClass}>Cargo</label>
                    <Select value={employment.positionId || 'none'} onValueChange={(v) => setEmp('positionId', v && v !== 'none' ? v : undefined)}>
                      <SelectTrigger className="w-full">
                        <span className="flex-1 text-left text-sm truncate">
                          {(() => { const p = positions.find((p) => p.id === employment.positionId); return p ? `${p.name}${p.area ? ` (${p.area.name})` : ''}` : '— Sin cargo —'; })()}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Sin cargo —</SelectItem>
                        {positions.filter((p) => p.isActive).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}{p.area ? ` (${p.area.name})` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedPosition?.role && (
                      <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                        Se asignará automáticamente el rol <strong>{selectedPosition.role.name}</strong>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {errors.root && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.root.message}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted/20"
            >
              Cancelar
            </button>
            <Button
              type="submit"
              disabled={isSubmitting || createUserMutation.isPending || createEmployeeMutation.isPending}
            >
              {(isSubmitting || createUserMutation.isPending || createEmployeeMutation.isPending)
                ? 'Creando...'
                : isEmployee ? 'Crear usuario y empleado' : 'Crear usuario'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
