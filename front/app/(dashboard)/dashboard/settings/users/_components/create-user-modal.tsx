'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Copy, Check } from 'lucide-react';
import { usersApi, type CreateUserPayload } from '../../../../../../lib/api/users';
import { hrApi, type CreateEmployeePayload } from '../../../../../../lib/api/hr';

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
  password: z.string().min(8, 'Mínimo 8 caracteres').optional().or(z.literal('')),
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
  'w-full rounded-lg border border-border bg-surface text-ink px-3 py-2 text-sm text-ink placeholder-faint outline-none transition focus:border-border-strong focus:ring-2 focus:ring-border';
const labelClass = 'mb-1.5 block text-xs font-medium text-muted';

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
    defaultValues: { firstName: '', lastName: '', email: '', password: '', roleIds: [] },
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
        password: values.password ?? '',
      };
      const user = await usersApi.create(payload);
      if (values.roleIds && values.roleIds.length > 0) {
        await usersApi.assignRoles(user.id, values.roleIds);
      }
      return user;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
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
      // Assign extra roles if selected (in addition to auto-role from position)
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
    if (!isEmployee && (!values.password || values.password.length < 8)) {
      setError('password', { message: 'Mínimo 8 caracteres' });
      return;
    }
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
        <div className="w-full max-w-sm rounded-2xl bg-surface shadow-xl p-6 space-y-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mx-auto">
            <span className="text-2xl">🔑</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Empleado creado con éxito</p>
            <p className="mt-1 text-xs text-muted">
              Contraseña temporal generada automáticamente. El empleado deberá cambiarla al iniciar sesión.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <span className="font-mono text-sm font-semibold text-amber-900">{tempPassword}</span>
            <button
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
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80"
          >
            Cerrar
          </button>
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
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Nuevo usuario</h2>
          <button onClick={onClose} className="rounded-md p-1 text-faint hover:bg-surface-2 hover:text-muted">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-6 py-5">

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Nombre</label>
              <input {...register('firstName')} className={inputClass} placeholder="Juan" />
              {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Apellido</label>
              <input {...register('lastName')} className={inputClass} placeholder="García" />
              {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p>}
            </div>
          </div>

          {/* Username preview */}
          {usernamePreview && (
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
              <p className="text-xs text-faint">Usuario generado automáticamente</p>
              <p className="mt-0.5 font-mono text-sm font-medium text-ink">{usernamePreview}</p>
            </div>
          )}

          {/* Email */}
          <div>
            <label className={labelClass}>Email</label>
            <input {...register('email')} type="email" className={inputClass} placeholder="usuario@empresa.com" />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>

          {/* Password — hidden when isEmployee (auto-generated) */}
          {!isEmployee && (
            <div>
              <label className={labelClass}>Contraseña temporal</label>
              <input {...register('password')} type="password" className={inputClass} placeholder="Mínimo 8 caracteres" />
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>
          )}

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
                      className="h-4 w-4 rounded border-border-strong accent-accent"
                    />
                    <span className="text-sm text-muted">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Employee toggle */}
          <div className="rounded-xl border border-border overflow-hidden">
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors">
              <input
                type="checkbox"
                checked={isEmployee}
                onChange={(e) => { setIsEmployee(e.target.checked); setEmployment(EMPTY_EMPLOYMENT); }}
                className="h-4 w-4 rounded border-border-strong accent-accent"
              />
              <div>
                <p className="text-sm font-medium text-ink">También es empleado de la empresa</p>
                <p className="text-xs text-faint">Crea simultáneamente su ficha de empleado en RRHH</p>
              </div>
            </label>

            {isEmployee && (
              <div className="border-t border-border bg-surface-2 px-4 py-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">Datos laborales</p>

                <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  La contraseña será generada automáticamente y se mostrará al finalizar.
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Tipo doc. *</label>
                    <select
                      value={employment.documentType}
                      onChange={(e) => setEmp('documentType', e.target.value as typeof employment.documentType)}
                      className={inputClass}
                    >
                      <option value="CI">C.I.</option>
                      <option value="RUC">RUC</option>
                      <option value="PASSPORT">Pasaporte</option>
                    </select>
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
                    <input
                      type="number"
                      min={0}
                      value={employment.baseSalary || ''}
                      onChange={(e) => setEmp('baseSalary', parseInt(e.target.value) || 0)}
                      className={inputClass}
                      placeholder="2800000"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Tipo de contrato</label>
                    <select
                      value={employment.contractType}
                      onChange={(e) => setEmp('contractType', e.target.value as typeof employment.contractType)}
                      className={inputClass}
                    >
                      <option value="PERMANENT">Permanente</option>
                      <option value="TEMPORARY">Temporal</option>
                      <option value="PART_TIME">Medio tiempo</option>
                      <option value="CONTRACTOR">Contratista</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Área</label>
                    <select
                      value={employment.areaId ?? ''}
                      onChange={(e) => setEmp('areaId', e.target.value || undefined)}
                      className={inputClass}
                    >
                      <option value="">— Sin área —</option>
                      {areas.filter((a) => a.isActive).map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Cargo</label>
                    <select
                      value={employment.positionId ?? ''}
                      onChange={(e) => setEmp('positionId', e.target.value || undefined)}
                      className={inputClass}
                    >
                      <option value="">— Sin cargo —</option>
                      {positions.filter((p) => p.isActive).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.area ? ` (${p.area.name})` : ''}</option>
                      ))}
                    </select>
                    {selectedPosition?.role && (
                      <p className="mt-1 text-xs text-blue-600">
                        Se asignará automáticamente el rol <strong>{selectedPosition.role.name}</strong>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {errors.root && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errors.root.message}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:bg-surface-2">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || createUserMutation.isPending || createEmployeeMutation.isPending}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50"
            >
              {(isSubmitting || createUserMutation.isPending || createEmployeeMutation.isPending)
                ? 'Creando...'
                : isEmployee ? 'Crear usuario y empleado' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
