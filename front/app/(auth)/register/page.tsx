'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { isApiError } from '../../../lib/api/api-error';

// Mirrors MODULE_TEMPLATES keys in back-end
const INDUSTRIES = [
  { value: 'electrodomesticos', label: 'Electrodomésticos' },
  { value: 'ferreteria',        label: 'Ferretería' },
  { value: 'supermercado',      label: 'Supermercado / Almacén' },
  { value: 'servicios',         label: 'Servicios' },
  { value: 'otro',              label: 'Otro' },
] as const;

const EMPLOYEE_RANGES = [
  { value: 'RANGE_1_5',    label: '1 – 5 empleados' },
  { value: 'RANGE_6_20',   label: '6 – 20 empleados' },
  { value: 'RANGE_21_50',  label: '21 – 50 empleados' },
  { value: 'RANGE_51_200', label: '51 – 200 empleados' },
  { value: 'RANGE_201',    label: '201+ empleados' },
] as const;

const schema = z.object({
  tenantName:    z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  industry:      z.string().optional(),
  firstName:     z.string().min(1, 'El nombre es requerido'),
  lastName:      z.string().min(1, 'El apellido es requerido'),
  email:         z.string().min(1, 'El email es requerido').email('Email inválido'),
  password:      z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  employeeCount: z.enum(['RANGE_1_5', 'RANGE_6_20', 'RANGE_21_50', 'RANGE_51_200', 'RANGE_201']),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await registerUser({
        tenantName:    values.tenantName,
        industry:      values.industry || undefined,
        firstName:     values.firstName,
        lastName:      values.lastName,
        email:         values.email,
        password:      values.password,
        employeeCount: values.employeeCount,
      });
    } catch (err) {
      if (isApiError(err)) {
        setServerError(err.message);
      } else {
        setServerError('Ocurrió un error inesperado');
      }
    }
  };

  const inputClass =
    'w-full rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder-faint outline-none transition focus:border-border-strong focus:ring-2 focus:ring-border';

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-border p-8">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-ink mb-4">
          <span className="text-canvas font-bold text-sm">J</span>
        </div>
        <h1 className="text-2xl font-semibold text-ink">Crear cuenta</h1>
        <p className="text-muted text-sm mt-1">
          Registrá tu empresa en JoapyCore
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Empresa */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-sm font-medium text-muted mb-1.5" htmlFor="tenantName">
              Nombre de la empresa
            </label>
            <input
              id="tenantName"
              type="text"
              autoComplete="organization"
              {...register("tenantName")}
              className={inputClass}
              placeholder="Mi Empresa S.A."
            />
            {errors.tenantName && (
              <p className="mt-1.5 text-xs text-red-600">{errors.tenantName.message}</p>
            )}
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label className="block text-sm font-medium text-muted mb-1.5" htmlFor="employeeCount">
              Tamaño
            </label>
            <select
              id="employeeCount"
              {...register("employeeCount")}
              className={inputClass}
              defaultValue="RANGE_1_5"
            >
              {EMPLOYEE_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {errors.employeeCount && (
              <p className="mt-1.5 text-xs text-red-600">{errors.employeeCount.message as string}</p>
            )}
          </div>
        </div>

        {/* Rubro */}
        <div>
          <label className="block text-sm font-medium text-muted mb-1.5" htmlFor="industry">
            Rubro <span className="text-faint font-normal">(opcional)</span>
          </label>
          <select
            id="industry"
            {...register("industry")}
            className={inputClass}
            defaultValue=""
          >
            <option value="">Sin especificar</option>
            {INDUSTRIES.map((ind) => (
              <option key={ind.value} value={ind.value}>{ind.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-faint">
            Usamos esto para pre-configurar categorías y módulos recomendados.
          </p>
        </div>

        {/* Responsable */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5" htmlFor="firstName">
              Nombre
            </label>
            <input
              id="firstName"
              type="text"
              autoComplete="given-name"
              {...register("firstName")}
              className={inputClass}
              placeholder="Juan"
            />
            {errors.firstName && (
              <p className="mt-1.5 text-xs text-red-600">{errors.firstName.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1.5" htmlFor="lastName">
              Apellido
            </label>
            <input
              id="lastName"
              type="text"
              autoComplete="family-name"
              {...register("lastName")}
              className={inputClass}
              placeholder="García"
            />
            {errors.lastName && (
              <p className="mt-1.5 text-xs text-red-600">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        {/* Credenciales */}
        <div>
          <label className="block text-sm font-medium text-muted mb-1.5" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
            className={inputClass}
            placeholder="tu@empresa.com"
          />
          {errors.email && (
            <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1.5" htmlFor="password">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              {...register("password")}
              className={`${inputClass} pr-10`}
              placeholder="Mínimo 8 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1.5 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        {serverError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-canvas transition hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-medium text-ink hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </div>
  );
}
