'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { usersApi, type CreateUserPayload } from '../../../../../../lib/api/users';
import { rolesApi } from '../../../../../../lib/api/roles';

const schema = z.object({
  firstName: z.string().min(1, 'Requerido'),
  lastName: z.string().min(1, 'Requerido'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  roleIds: z.array(z.string()).optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  onClose: () => void;
}

const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100';

export function CreateUserModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const overlayRef = useRef<HTMLDivElement>(null);

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: rolesApi.list,
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: CreateUserPayload = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      };
      const user = await usersApi.create(payload);
      if (values.roleIds && values.roleIds.length > 0) {
        await usersApi.assignRoles(user.id, values.roleIds);
      }
      return user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err.response?.data?.message ?? 'Error al crear el usuario';
      setError('root', { message: Array.isArray(msg) ? msg[0] : msg });
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Nuevo usuario</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit((v) => createMutation.mutate(v))}
          className="space-y-4 px-6 py-5"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Nombre
              </label>
              <input {...register('firstName')} className={inputClass} placeholder="Juan" />
              {errors.firstName && (
                <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Apellido
              </label>
              <input {...register('lastName')} className={inputClass} placeholder="García" />
              {errors.lastName && (
                <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">Email</label>
            <input
              {...register('email')}
              type="email"
              className={inputClass}
              placeholder="usuario@empresa.com"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Contraseña temporal
            </label>
            <input
              {...register('password')}
              type="password"
              className={inputClass}
              placeholder="Mínimo 8 caracteres"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          {roles.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Rol (opcional)
              </label>
              <div className="space-y-1.5 rounded-lg border border-slate-200 p-3">
                {roles.map((role) => (
                  <label key={role.id} className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      value={role.id}
                      {...register('roleIds')}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 accent-slate-900"
                    />
                    <span className="text-sm text-slate-700">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {errors.root && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {errors.root.message}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
