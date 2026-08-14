'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { usersApi, type UserResponse } from '../../../../../../lib/api/users';
import { rolesApi } from '../../../../../../lib/api/roles';
import { PERMISSION_GROUPS } from '../../../../../../lib/permissions';
import { UserStatusBadge } from './user-status-badge';

interface Props {
  user: UserResponse;
  currentUserId?: string;
  onClose: () => void;
}

function PermissionsAccordion({
  rolePermissions,
  extraPermissions,
  onSave,
  saving,
}: {
  rolePermissions: string[];
  extraPermissions: string[];
  onSave: (keys: string[]) => void;
  saving: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(extraPermissions));
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });

  const toggleGroup = (module: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(module)) { next.delete(module); } else { next.add(module); }
      return next;
    });

  const hasChanges =
    JSON.stringify([...selected].sort()) !==
    JSON.stringify([...extraPermissions].sort());

  return (
    <div className="space-y-1">
      {PERMISSION_GROUPS.map((group) => {
        const isOpen = openGroups.has(group.module);
        const groupExtras = group.permissions.filter((p) => selected.has(p.key));
        return (
          <div key={group.module} className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => toggleGroup(group.module)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
              <span className="text-sm font-medium text-muted-foreground">{group.label}</span>
              <div className="flex items-center gap-2">
                {groupExtras.length > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                    +{groupExtras.length}
                  </span>
                )}
                {isOpen ? (
                  <ChevronDown size={14} className="text-muted-foreground/60" />
                ) : (
                  <ChevronRight size={14} className="text-muted-foreground/60" />
                )}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border px-3 py-2 space-y-1.5">
                {group.permissions.map((perm) => {
                  const fromRole = rolePermissions.includes(perm.key);
                  const isExtra = selected.has(perm.key);
                  return (
                    <label
                      key={perm.key}
                      className={`flex items-center gap-2.5 ${fromRole ? 'opacity-60' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={fromRole || isExtra}
                        disabled={fromRole}
                        onChange={() => !fromRole && toggle(perm.key)}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <span className="flex-1 text-sm text-muted-foreground">{perm.label}</span>
                      {fromRole && (
                        <span className="text-xs text-muted-foreground/60">via rol</span>
                      )}
                      {!fromRole && isExtra && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">extra</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {hasChanges && (
        <button
          onClick={() => onSave([...selected])}
          disabled={saving}
          className="mt-2 w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar permisos extra'}
        </button>
      )}
    </div>
  );
}

function TempPasswordDisplay({ password, expiresAt }: { password: string; expiresAt?: string | null }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleString('es-PY', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/30 dark:bg-amber-950/30">
      <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300 mb-1.5">Contraseña temporal activa</p>
      <div className="flex items-center gap-2">
        <span className="flex-1 font-mono text-sm font-semibold text-amber-900 dark:text-amber-200">{password}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded p-1 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30"
          title="Copiar"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      {expiryLabel && (
        <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">Vence: {expiryLabel}</p>
      )}
    </div>
  );
}

export function UserDetailPanel({ user, currentUserId, onClose }: Props) {
  const queryClient = useQueryClient();
  const isSelf = user.id === currentUserId;

  const { data: userDetail } = useQuery({
    queryKey: ['users', user.id],
    queryFn: () => usersApi.getById(user.id),
  });

  const effectiveUser = userDetail ?? user;

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: rolesApi.list,
  });

  const assignableRoles = roles.filter((r) => !r.isSystem);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(
    () => new Set(user.roles.map((r) => r.id)),
  );

  const rolePermissions = roles
    .filter((r) => selectedRoleIds.has(r.id))
    .flatMap((r) => r.rolePermissions.map((rp) => rp.permission.key));

  const rolesChanged =
    JSON.stringify([...selectedRoleIds].sort()) !==
    JSON.stringify(user.roles.map((r) => r.id).sort());

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['users'] }),
      queryClient.invalidateQueries({ queryKey: ['users', user.id] }),
    ]);

  const deactivateMutation = useMutation({
    mutationFn: () => usersApi.deactivate(user.id),
    onSuccess: invalidate,
  });

  const reactivateMutation = useMutation({
    mutationFn: () => usersApi.reactivate(user.id),
    onSuccess: invalidate,
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => usersApi.resetPassword(user.id),
    onSuccess: invalidate,
  });

  const assignRolesMutation = useMutation({
    mutationFn: (roleIds: string[]) => usersApi.assignRoles(user.id, roleIds),
    onSuccess: invalidate,
  });

  const setPermissionsMutation = useMutation({
    mutationFn: (permissions: string[]) =>
      usersApi.setExtraPermissions(user.id, permissions),
    onSuccess: invalidate,
  });

  const toggleRole = (id: string) =>
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative z-50 flex h-full w-full max-w-md flex-col bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/30 text-sm font-semibold text-muted-foreground">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              {user.username && (
                <p className="text-xs text-muted-foreground/60">@{user.username}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted/20"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Estado */}
          <div className="border-b border-border px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Estado</p>
                <div className="mt-1">
                  <UserStatusBadge status={user.status} />
                </div>
              </div>
              {!isSelf && (
                <div className="flex flex-col items-end gap-2">
                  {user.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      onClick={() => deactivateMutation.mutate()}
                      disabled={deactivateMutation.isPending}
                      className="rounded-lg border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      Desactivar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => reactivateMutation.mutate()}
                      disabled={reactivateMutation.isPending}
                      className="rounded-lg border border-emerald-200 px-3 py-1.5 text-sm text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800/30 dark:text-emerald-400 dark:hover:bg-emerald-950/30 disabled:opacity-50"
                    >
                      Reactivar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Contraseña */}
          {!isSelf && (
            <div className="border-b border-border px-6 py-4">
              <p className="text-sm font-semibold text-foreground">Contraseña</p>

              {effectiveUser.mustChangePassword && effectiveUser.tempPassword ? (
                <TempPasswordDisplay
                  password={effectiveUser.tempPassword}
                  expiresAt={effectiveUser.tempPasswordExpiresAt}
                />
              ) : effectiveUser.mustChangePassword && !effectiveUser.tempPassword ? (
                <div className="mt-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground">Contraseña temporal expirada</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                    Generá una nueva para que el usuario pueda acceder.
                  </p>
                </div>
              ) : null}

              <p className="mt-3 text-xs text-muted-foreground">
                {effectiveUser.mustChangePassword
                  ? 'Podés generar una contraseña nueva si el usuario perdió el acceso.'
                  : 'Genera una contraseña temporal que el usuario deberá cambiar al ingresar. Válida por 24 horas.'}
              </p>
              <button
                type="button"
                onClick={() => resetPasswordMutation.mutate()}
                disabled={resetPasswordMutation.isPending}
                className="mt-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/20 disabled:opacity-50"
              >
                {resetPasswordMutation.isPending ? 'Generando...' : 'Generar nueva contraseña'}
              </button>
            </div>
          )}

          {/* Roles */}
          <div className="border-b border-border px-6 py-4">
            <p className="mb-3 text-sm font-semibold text-foreground">Roles</p>
            {assignableRoles.length === 0 ? (
              <p className="text-sm text-muted-foreground/60">No hay roles creados aún</p>
            ) : (
              <div className="space-y-1.5">
                {assignableRoles.map((role) => (
                  <label key={role.id} className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.has(role.id)}
                      onChange={() => toggleRole(role.id)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <span className="text-sm text-muted-foreground">{role.name}</span>
                  </label>
                ))}
              </div>
            )}
            {rolesChanged && (
              <button
                type="button"
                onClick={() => assignRolesMutation.mutate([...selectedRoleIds])}
                disabled={assignRolesMutation.isPending}
                className="mt-3 w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {assignRolesMutation.isPending ? 'Guardando...' : 'Guardar roles'}
              </button>
            )}
          </div>

          {/* Permisos adicionales */}
          <div className="px-6 py-4">
            <p className="mb-1 text-sm font-semibold text-foreground">Permisos adicionales</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Permisos extra sobre los que otorga su rol. Los permisos de rol no se pueden quitar desde aquí.
            </p>
            <PermissionsAccordion
              rolePermissions={rolePermissions}
              extraPermissions={effectiveUser.extraPermissions}
              onSave={(keys) => setPermissionsMutation.mutate(keys)}
              saving={setPermissionsMutation.isPending}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
