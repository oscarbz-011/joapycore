'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { usersApi } from '../../../../../lib/api/users';
import { useAuth } from '../../../../../lib/auth-context';

function useProfile() {
  return useQuery({ queryKey: ['me'], queryFn: usersApi.getMe });
}

function ProfileForm({
  firstName,
  lastName,
  username,
}: {
  firstName: string;
  lastName: string;
  username: string | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ firstName, lastName, username: username ?? '' });
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      usersApi.updateMe({
        firstName: form.firstName,
        lastName: form.lastName,
        username: form.username.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      setSuccess(true);
      setServerError('');
      setTimeout(() => setSuccess(false), 2500);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      setServerError(err?.response?.data?.message ?? 'Error al guardar');
    },
  });

  const isDirty =
    form.firstName !== firstName ||
    form.lastName !== lastName ||
    (form.username.trim() || null) !== username;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setServerError('');
        mutation.mutate();
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-muted mb-1">Nombre</label>
          <input
            className="w-full rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong"
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted mb-1">Apellido</label>
          <input
            className="w-full rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong"
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-muted mb-1">
          Nombre de usuario
          <span className="ml-1 text-xs font-normal text-faint">(para iniciar sesión)</span>
        </label>
        <div className="flex items-center rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 focus-within:border-border-strong focus-within:ring-1 focus-within:ring-border-strong">
          <span className="select-none text-sm text-faint mr-1">@</span>
          <input
            className="flex-1 text-sm text-ink outline-none bg-transparent"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            placeholder="juan.garcia"
            pattern="[a-zA-Z0-9._]+"
            minLength={3}
            maxLength={30}
          />
        </div>
        <p className="mt-1 text-xs text-faint">
          Solo letras, números, puntos y guiones bajos. Mínimo 3 caracteres.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!isDirty || mutation.isPending}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50 transition-colors"
        >
          {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {success && <span className="text-sm text-green-600">Cambios guardados</span>}
        {serverError && <span className="text-sm text-red-600">{serverError}</span>}
      </div>
    </form>
  );
}

function PasswordForm({ onSuccess }: { onSuccess?: () => void }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [success, setSuccess] = useState(false);
  const [localError, setLocalError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      usersApi.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }),
    onSuccess: () => {
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
      onSuccess?.();
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      setLocalError(err?.response?.data?.message ?? 'Error al cambiar contraseña');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError('');
    if (form.newPassword !== form.confirmPassword) {
      setLocalError('Las contraseñas nuevas no coinciden');
      return;
    }
    if (form.newPassword.length < 8) {
      setLocalError('La contraseña nueva debe tener al menos 8 caracteres');
      return;
    }
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-muted mb-1">Contraseña actual</label>
        <input
          type="password"
          className="w-full rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong"
          value={form.currentPassword}
          onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
          required
          autoComplete="current-password"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-muted mb-1">Nueva contraseña</label>
        <input
          type="password"
          className="w-full rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong"
          value={form.newPassword}
          onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
          required
          autoComplete="new-password"
          minLength={8}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-muted mb-1">Confirmar nueva contraseña</label>
        <input
          type="password"
          className="w-full rounded-lg border border-border-strong bg-surface text-ink px-3 py-2 text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong"
          value={form.confirmPassword}
          onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
          required
          autoComplete="new-password"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80 disabled:opacity-50 transition-colors"
        >
          {mutation.isPending ? 'Guardando...' : 'Cambiar contraseña'}
        </button>
        {success && <span className="text-sm text-green-600">Contraseña actualizada</span>}
        {localError && <span className="text-sm text-red-600">{localError}</span>}
      </div>
    </form>
  );
}

export default function ProfilePage() {
  const { data: me, isLoading } = useProfile();
  const { mustChangePassword, clearMustChangePassword } = useAuth();

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted">Cargando perfil...</div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {mustChangePassword && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-800">Debés cambiar tu contraseña</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Tu cuenta fue creada con una contraseña temporal. Cambiala antes de continuar usando el sistema.
            </p>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-xl font-semibold text-ink">Mi perfil</h1>
        <p className="mt-1 text-sm text-muted">{me?.email}</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold text-ink">Información personal</h2>
        {me && <ProfileForm firstName={me.firstName} lastName={me.lastName} username={me.username} />}
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-1 text-sm font-semibold text-ink">Cambiar contraseña</h2>
        <p className="mb-4 text-xs text-muted">La nueva contraseña debe tener al menos 8 caracteres.</p>
        <PasswordForm onSuccess={mustChangePassword ? clearMustChangePassword : undefined} />
      </section>
    </div>
  );
}
