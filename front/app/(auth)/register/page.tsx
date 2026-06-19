'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import axios from 'axios';

const INDUSTRIES = [
  { value: 'electrodomesticos', label: 'Electrodomésticos' },
] as const;

const schema = z.object({
  tenantName: z.string().min(2, 'El nombre de la empresa debe tener al menos 2 caracteres'),
  industry: z.enum(['electrodomesticos']),
  firstName: z.string().min(1, 'El nombre es requerido'),
  lastName: z.string().min(1, 'El apellido es requerido'),
  email: z.string().min(1, 'El email es requerido').email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await registerUser(values);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message ?? 'No se pudo crear la cuenta';
        setServerError(Array.isArray(msg) ? msg[0] : msg);
      } else {
        setServerError('Ocurrió un error inesperado');
      }
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 mb-4">
          <span className="text-white font-bold text-sm">J</span>
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">Crear cuenta</h1>
        <p className="text-slate-500 text-sm mt-1">Registrá tu empresa en JoapyCore</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="tenantName">
            Nombre de la empresa
          </label>
          <input
            id="tenantName"
            type="text"
            autoComplete="organization"
            {...register('tenantName')}
            className={inputClass}
            placeholder="Mi Empresa S.A."
          />
          {errors.tenantName && (
            <p className="mt-1.5 text-xs text-red-600">{errors.tenantName.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="industry">
            Rubro
          </label>
          <select
            id="industry"
            {...register('industry')}
            className={inputClass}
            defaultValue=""
          >
            <option value="" disabled>
              Seleccioná tu rubro
            </option>
            {INDUSTRIES.map((ind) => (
              <option key={ind.value} value={ind.value}>
                {ind.label}
              </option>
            ))}
          </select>
          {errors.industry && (
            <p className="mt-1.5 text-xs text-red-600">{errors.industry.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="firstName">
              Nombre
            </label>
            <input
              id="firstName"
              type="text"
              autoComplete="given-name"
              {...register('firstName')}
              className={inputClass}
              placeholder="Juan"
            />
            {errors.firstName && (
              <p className="mt-1.5 text-xs text-red-600">{errors.firstName.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="lastName">
              Apellido
            </label>
            <input
              id="lastName"
              type="text"
              autoComplete="family-name"
              {...register('lastName')}
              className={inputClass}
              placeholder="García"
            />
            {errors.lastName && (
              <p className="mt-1.5 text-xs text-red-600">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            className={inputClass}
            placeholder="tu@empresa.com"
          />
          {errors.email && (
            <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
            className={inputClass}
            placeholder="Mínimo 8 caracteres"
          />
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
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Creando cuenta...' : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="font-medium text-slate-900 hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </div>
  );
}
