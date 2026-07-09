'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { isApiError } from '../../../lib/api/api-error';

const schema = z.object({
  emailOrUsername: z.string().min(1, 'El email o usuario es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
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
      await login(values.emailOrUsername, values.password);
    } catch (err) {
      if (isApiError(err)) {
        setServerError(err.message);
      } else {
        setServerError('Ocurrió un error inesperado');
      }
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-50';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 mb-4">
          <span className="text-white font-bold text-sm">J</span>
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">Iniciar sesión</h1>
        <p className="text-slate-500 text-sm mt-1">Ingresá a tu cuenta de JoapyCore</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="emailOrUsername">
            Email o usuario
          </label>
          <input
            id="emailOrUsername"
            type="text"
            autoComplete="username"
            {...register('emailOrUsername')}
            className={inputClass}
            placeholder="tu@empresa.com"
          />
          {errors.emailOrUsername && (
            <p className="mt-1.5 text-xs text-red-600">{errors.emailOrUsername.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="password">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              {...register('password')}
              className={`${inputClass} pr-10`}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        ¿No tenés cuenta?{' '}
        <Link href="/register" className="font-medium text-slate-900 hover:underline">
          Registrá tu empresa
        </Link>
      </p>
    </div>
  );
}
