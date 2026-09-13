'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../../../lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ForcePasswordModal() {
  const { changePassword, getPendingTempPassword } = useAuth();

  // Solo en memoria (ver auth-context): tras recargar la página queda vacío.
  const [storedTmp] = useState(() => getPendingTempPassword() ?? '');

  const [form, setForm] = useState({
    currentPassword: storedTmp,
    newPassword: '',
    confirmPassword: '',
  });
  const [localError, setLocalError] = useState('');

  const mutation = useMutation({
    mutationFn: () => changePassword(form.currentPassword, form.newPassword),
    onError: (err: Error) => {
      setLocalError(apiErrorMessage(err, 'Error al cambiar la contraseña'));
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
      setLocalError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[6px]">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Cambiá tu contraseña</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Tu cuenta fue creada con una contraseña temporal. Establecé una contraseña permanente para continuar.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Contraseña actual</Label>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
            />
            {storedTmp && (
              <p className="text-xs text-muted-foreground/60">
                Pre-completada con tu contraseña temporal.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Nueva contraseña</Label>
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.newPassword}
              onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Confirmar nueva contraseña</Label>
            <Input
              type="password"
              autoComplete="new-password"
              required
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            />
          </div>

          {localError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {localError}
            </div>
          )}

          <Button type="submit" className="mt-2 w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Guardando...' : 'Cambiar contraseña'}
          </Button>
        </form>
      </div>
    </div>
  );
}
