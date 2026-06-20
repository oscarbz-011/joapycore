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
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleGroup = (module: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(module) ? next.delete(module) : next.add(module);
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
          <div key={group.module} className="rounded-lg border border-slate-100">
            <button
              type="button"
              onClick={() => toggleGroup(group.module)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
              <span className="text-sm font-medium text-slate-700">{group.label}</span>
              <div className="flex items-center gap-2">
                {groupExtras.length > 0 && (
                  <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white">
                    +{groupExtras.length}
                  </span>
                )}
                {isOpen ? (
                  <ChevronDown size={14} className="text-slate-400" />
                ) : (
                  <ChevronRight size={14} className="text-slate-400" />
                )}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 px-3 py-2 space-y-1.5">
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
                        className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                      />
                      <span className="flex-1 text-sm text-slate-700">{perm.label}</span>
                      {fromRole && (
                        <span className="text-xs text-slate-400">via rol</span>
                      )}
                      {!fromRole && isExtra && (
                        <span className="text-xs text-emerald-600">extra</span>
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
          className="mt-2 w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar permisos extra'}
        </button>
      )}
    </div>
  );
}

function TempPasswordDisplay({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <span className="flex-1 font-mono text-sm font-medium text-amber-900">{password}</span>
      <button
        onClick={copy}
        className="rounded p-1 text-amber-600 hover:bg-amber-100"
        title="Copiar"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export function UserDetailPanel({ user, currentUserId, onClose }: Props) {
  const queryClient = useQueryClient();
  const isSelf = user.id === currentUserId;
  const [tempPassword, setTempPassword] = useState<string | null>(null);

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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

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
    onSuccess: (data) => setTempPassword(data.tempPassword),
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
      <aside className="relative z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Estado */}
          <div className="border-b border-slate-100 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Estado</p>
                <div className="mt-1">
                  <UserStatusBadge status={user.status} />
                </div>
              </div>
              {!isSelf && (
                <div className="flex flex-col items-end gap-2">
                  {user.status === 'ACTIVE' ? (
                    <button
                      onClick={() => deactivateMutation.mutate()}
                      disabled={deactivateMutation.isPending}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Desactivar
                    </button>
                  ) : (
                    <button
                      onClick={() => reactivateMutation.mutate()}
                      disabled={reactivateMutation.isPending}
                      className="rounded-lg border border-emerald-200 px-3 py-1.5 text-sm text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Reactivar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Reset contraseña */}
          {!isSelf && (
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="text-sm font-medium text-slate-700">Contraseña</p>
              <p className="mt-1 text-xs text-slate-500">
                Genera una contraseña temporal que el usuario deberá cambiar al ingresar.
              </p>
              <button
                onClick={() => {
                  setTempPassword(null);
                  resetPasswordMutation.mutate();
                }}
                disabled={resetPasswordMutation.isPending}
                className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {resetPasswordMutation.isPending ? 'Generando...' : 'Resetear contraseña'}
              </button>
              {tempPassword && <TempPasswordDisplay password={tempPassword} />}
            </div>
          )}

          {/* Roles */}
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Roles</p>
            {assignableRoles.length === 0 ? (
              <p className="text-sm text-slate-400">No hay roles creados aún</p>
            ) : (
              <div className="space-y-1.5">
                {assignableRoles.map((role) => (
                  <label key={role.id} className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.has(role.id)}
                      onChange={() => toggleRole(role.id)}
                      className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                    />
                    <span className="text-sm text-slate-700">{role.name}</span>
                  </label>
                ))}
              </div>
            )}
            {rolesChanged && (
              <button
                onClick={() => assignRolesMutation.mutate([...selectedRoleIds])}
                disabled={assignRolesMutation.isPending}
                className="mt-3 w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {assignRolesMutation.isPending ? 'Guardando...' : 'Guardar roles'}
              </button>
            )}
          </div>

          {/* Permisos adicionales */}
          <div className="px-6 py-4">
            <p className="mb-1 text-sm font-semibold text-slate-900">Permisos adicionales</p>
            <p className="mb-3 text-xs text-slate-500">
              Permisos extra sobre los que otorga su rol. Los permisos de rol no se pueden quitar desde aquí.
            </p>
            <PermissionsAccordion
              rolePermissions={rolePermissions}
              extraPermissions={user.extraPermissions}
              onSave={(keys) => setPermissionsMutation.mutate(keys)}
              saving={setPermissionsMutation.isPending}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
