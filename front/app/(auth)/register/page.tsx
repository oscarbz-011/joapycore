'use client';

import { useForm, Controller } from 'react-hook-form';
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
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// Los valores son el enum Industry del backend, no texto libre: el rubro
// define las categorías sembradas, los módulos activados y el tipo de producto
// por defecto (una carpintería fabrica, una ferretería revende).
const INDUSTRIES = [
  { value: 'ELECTRODOMESTICOS', label: 'Electrodomésticos' },
  { value: 'FERRETERIA',        label: 'Ferretería' },
  { value: 'SUPERMERCADO',      label: 'Supermercado / Almacén' },
  { value: 'MUEBLERIA',         label: 'Mueblería / Carpintería' },
  { value: 'SERVICIOS',         label: 'Servicios' },
  { value: 'OTRO',              label: 'Otro' },
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
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { employeeCount: 'RANGE_1_5' },
  });

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

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-8">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-foreground mb-4">
          <span className="text-background font-bold text-sm">J</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Crear cuenta</h1>
        <p className="text-muted-foreground text-sm mt-1">Registrá tu empresa en JoapyCore</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Empresa */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1 space-y-1.5">
            <Label htmlFor="tenantName">Nombre de la empresa</Label>
            <Input
              id="tenantName"
              type="text"
              autoComplete="organization"
              {...register('tenantName')}
              placeholder="Mi Empresa S.A."
            />
            {errors.tenantName && (
              <p className="text-xs text-destructive">{errors.tenantName.message}</p>
            )}
          </div>

          <div className="col-span-2 sm:col-span-1 space-y-1.5">
            <Label>Tamaño</Label>
            <Controller
              name="employeeCount"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">
                      {EMPLOYEE_RANGES.find((r) => r.value === field.value)?.label ?? 'Seleccionar...'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_RANGES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.employeeCount && (
              <p className="text-xs text-destructive">{errors.employeeCount.message as string}</p>
            )}
          </div>
        </div>

        {/* Rubro */}
        <div className="space-y-1.5">
          <Label>
            Rubro{' '}
            <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Controller
            name="industry"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value || 'none'}
                onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
              >
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">
                    {INDUSTRIES.find((i) => i.value === field.value)?.label ?? 'Sin especificar'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin especificar</SelectItem>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind.value} value={ind.value}>{ind.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-muted-foreground">
            Usamos esto para pre-configurar categorías y módulos recomendados.
          </p>
        </div>

        {/* Responsable */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">Nombre</Label>
            <Input
              id="firstName"
              type="text"
              autoComplete="given-name"
              {...register('firstName')}
              placeholder="Juan"
            />
            {errors.firstName && (
              <p className="text-xs text-destructive">{errors.firstName.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lastName">Apellido</Label>
            <Input
              id="lastName"
              type="text"
              autoComplete="family-name"
              {...register('lastName')}
              placeholder="García"
            />
            {errors.lastName && (
              <p className="text-xs text-destructive">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        {/* Credenciales */}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            placeholder="tu@empresa.com"
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              {...register('password')}
              className="pr-10"
              placeholder="Mínimo 8 caracteres"
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
          {isSubmitting ? 'Creando cuenta...' : 'Crear cuenta'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </div>
  );
}
