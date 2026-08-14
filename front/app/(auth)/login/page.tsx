'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { isApiError } from '../../../lib/api/api-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-8">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-foreground mb-4">
          <span className="text-background font-bold text-sm">J</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Iniciar sesión</h1>
        <p className="text-muted-foreground text-sm mt-1">Ingresá a tu cuenta de JoapyCore</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="emailOrUsername">Email o usuario</Label>
          <Input
            id="emailOrUsername"
            type="text"
            autoComplete="username"
            {...register('emailOrUsername')}
            placeholder="tu@empresa.com"
          />
          {errors.emailOrUsername && (
            <p className="text-xs text-destructive">{errors.emailOrUsername.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              {...register('password')}
              placeholder="••••••••"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        {serverError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {serverError}
          </div>
        )}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Ingresando...' : 'Ingresar'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿No tenés cuenta?{' '}
        <Link href="/register" className="font-medium text-foreground hover:underline">
          Registrá tu empresa
        </Link>
      </p>
    </div>
  );
}
