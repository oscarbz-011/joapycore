'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Camera, AlertTriangle, Mail, Phone, Calendar, Building2 } from 'lucide-react';
import { usersApi } from '../../../../../lib/api/users';
import { useAuth } from '../../../../../lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ProfilePage() {
  const { mustChangePassword, clearMustChangePassword } = useAuth();
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: usersApi.getMe });

  // ── Profile form state ──────────────────────────────────────────────────────
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', username: '' });
  const [ready, setReady] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');

  if (me && !ready) {
    setForm({ firstName: me.firstName, lastName: me.lastName, phone: me.phone ?? '', username: me.username ?? '' });
    setReady(true);
  }

  const profileMutation = useMutation({
    mutationFn: () =>
      usersApi.updateMe({
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone.trim() || undefined,
        username: form.username.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      setProfileSuccess(true);
      setProfileError('');
      setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (err: Error) => {
      setProfileError(apiErrorMessage(err, 'Error al guardar los cambios'));
    },
  });

  // ── Password form state ─────────────────────────────────────────────────────
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwOk, setPwOk] = useState(false);

  const pwMutation = useMutation({
    mutationFn: () =>
      usersApi.changePassword({ currentPassword: pw.current, newPassword: pw.next }),
    onSuccess: () => {
      setPw({ current: '', next: '', confirm: '' });
      setPwOk(true);
      setPwError('');
      setPwOpen(false);
      clearMustChangePassword?.();
      setTimeout(() => setPwOk(false), 3000);
    },
    onError: (err: Error) => {
      setPwError(apiErrorMessage(err, 'Error al cambiar la contraseña'));
    },
  });

  function submitPassword() {
    setPwError('');
    if (!pw.current)              { setPwError('Ingresá tu contraseña actual'); return; }
    if (pw.next.length < 8)       { setPwError('La nueva contraseña debe tener al menos 8 caracteres'); return; }
    if (pw.next !== pw.confirm)   { setPwError('Las contraseñas no coinciden'); return; }
    pwMutation.mutate();
  }

  const set = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [f]: e.target.value }));

  // ── Derived display values ──────────────────────────────────────────────────
  const fullName   = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || '—';
  const joinedDate = me?.createdAt
    ? new Date(me.createdAt).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : null;

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando...</div>;
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-foreground">Mi perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administrá tu información personal y seguridad de acceso.
        </p>
      </div>

      {mustChangePassword && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/30 dark:bg-amber-950/30">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Debés cambiar tu contraseña</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Tu cuenta fue creada con una contraseña temporal. Cambiala antes de continuar usando el sistema.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex min-h-[520px]">

          {/* ── Left panel ────────────────────────────────────────────────── */}
          <div className="w-64 shrink-0 border-r border-border bg-muted/20 flex flex-col items-center gap-5 p-6 pt-8">
            <div className="relative">
              <div className="h-24 w-24 rounded-full border-2 border-border bg-muted/40 flex items-center justify-center overflow-hidden">
                <User size={36} className="text-muted-foreground/50" />
              </div>
              <button
                type="button"
                className="absolute bottom-0.5 right-0.5 h-7 w-7 rounded-full bg-primary flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
              >
                <Camera size={13} className="text-primary-foreground" />
              </button>
            </div>

            <div className="text-center">
              <p className="font-semibold text-foreground leading-tight">{fullName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Administrador</p>
            </div>

            <div className="w-full space-y-3 pt-4 border-t border-border">
              <div className="flex items-start gap-2.5">
                <Mail size={13} className="mt-0.5 shrink-0 text-muted-foreground/60" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">Email</p>
                  <p className="text-xs text-foreground break-all leading-snug mt-0.5">{me?.email ?? '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Phone size={13} className="mt-0.5 shrink-0 text-muted-foreground/60" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">Teléfono</p>
                  <p className={`text-xs mt-0.5 ${me?.phone ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                    {me?.phone ?? 'Sin registrar'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Building2 size={13} className="mt-0.5 shrink-0 text-muted-foreground/60" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">Sucursal</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Principal</p>
                </div>
              </div>
              {joinedDate && (
                <div className="flex items-start gap-2.5">
                  <Calendar size={13} className="mt-0.5 shrink-0 text-muted-foreground/60" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">Miembro desde</p>
                    <p className="text-xs text-foreground mt-0.5">{joinedDate}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right panel: form ─────────────────────────────────────────── */}
          {/*
            NOTE: password inputs are intentionally NOT inside this form to
            avoid browser validation blocking the profile save when the
            password section is expanded but empty.
          */}
          <div className="flex-1 flex flex-col">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setProfileError('');
                profileMutation.mutate();
              }}
              className="flex-1 flex flex-col"
            >
              <div className="flex-1 p-6 space-y-6">

                {/* Datos personales */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Datos personales</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Nombre <span className="text-destructive">*</span></Label>
                      <Input value={form.firstName} onChange={set('firstName')} required placeholder="Juan" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Apellido <span className="text-destructive">*</span></Label>
                      <Input value={form.lastName} onChange={set('lastName')} required placeholder="García" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input value={me?.email ?? ''} disabled readOnly />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Teléfono</Label>
                      <Input value={form.phone} onChange={set('phone')} placeholder="+595 981 000 000" />
                    </div>
                  </div>
                </section>

                {/* Datos de usuario */}
                <section className="space-y-4 pt-4 border-t border-border">
                  <h3 className="text-sm font-semibold text-foreground">Datos de usuario</h3>
                  <div className="space-y-1.5">
                    <Label>Nombre de usuario</Label>
                    <div className="flex items-center rounded-3xl border border-transparent bg-input/50 px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 transition-[box-shadow,border-color]">
                      <span className="select-none text-sm text-muted-foreground/60 mr-1">@</span>
                      <input
                        className="flex-1 h-9 text-sm text-foreground outline-none bg-transparent placeholder:text-muted-foreground/40"
                        value={form.username}
                        onChange={set('username')}
                        placeholder="juan.garcia"
                        pattern="[a-zA-Z0-9._]+"
                        minLength={3}
                        maxLength={30}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground/60">
                      Solo letras, números, puntos y guiones bajos. Se usa para iniciar sesión.
                    </p>
                  </div>

                  {/* Contraseña — inputs sin "required" para no bloquear el submit del form principal */}
                  <div className="rounded-lg border border-border bg-muted/10 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Contraseña</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Actualizá tu contraseña de acceso al sistema.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setPwOpen((v) => !v); setPwError(''); setPw({ current: '', next: '', confirm: '' }); }}
                      >
                        {pwOpen ? 'Cancelar' : 'Cambiar contraseña'}
                      </Button>
                    </div>

                    {pwOpen && (
                      <div className="mt-4 pt-3 border-t border-border space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label>Contraseña actual</Label>
                            <Input
                              type="password"
                              value={pw.current}
                              onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                              autoComplete="current-password"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Nueva contraseña</Label>
                            <Input
                              type="password"
                              value={pw.next}
                              onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                              autoComplete="new-password"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Confirmar</Label>
                            <Input
                              type="password"
                              value={pw.confirm}
                              onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                              autoComplete="new-password"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Button type="button" size="sm" onClick={submitPassword} disabled={pwMutation.isPending}>
                            {pwMutation.isPending ? 'Guardando...' : 'Actualizar contraseña'}
                          </Button>
                          {pwError && <span className="text-xs text-destructive">{pwError}</span>}
                          {pwOk    && <span className="text-xs text-emerald-500">Contraseña actualizada</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Dirección */}
                <section className="space-y-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Dirección</h3>
                    <span className="rounded-full bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground/60">Próximamente</span>
                  </div>
                  <div className="opacity-40 pointer-events-none select-none space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Dirección línea 1</Label>
                        <Input disabled placeholder="Av. Principal 123" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Dirección línea 2</Label>
                        <Input disabled placeholder="Apto. 4B" />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="space-y-1.5">
                        <Label>País</Label>
                        <Input disabled placeholder="Seleccionar" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Departamento</Label>
                        <Input disabled placeholder="Seleccionar" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Ciudad</Label>
                        <Input disabled placeholder="Seleccionar" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Código postal</Label>
                        <Input disabled placeholder="1001" />
                      </div>
                    </div>
                  </div>
                </section>

              </div>

              {/* Profile form footer */}
              <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4 bg-muted/10">
                {profileError   && <span className="text-sm text-destructive">{profileError}</span>}
                {profileSuccess && <span className="text-sm text-emerald-500">Cambios guardados</span>}
                <Button type="button" variant="outline" onClick={() => {
                  setForm({ firstName: me?.firstName ?? '', lastName: me?.lastName ?? '', phone: me?.phone ?? '', username: me?.username ?? '' });
                  setProfileError('');
                }}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={profileMutation.isPending}>
                  {profileMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                </Button>
              </div>
            </form>

          </div>
        </div>
      </div>
    </div>
  );
}
