'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Shield, ShieldCheck, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { rolesApi, type RoleResponse } from '../../../../../lib/api/roles';
import { PERMISSION_GROUPS, getPermissionLabel } from '../../../../../lib/permissions';
import { Button } from '@/components/ui/button';

function CreateRoleModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => rolesApi.create({ name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err.response?.data?.message ?? 'Error al crear el rol');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-xl p-6">
        <h2 className="mb-4 text-base font-semibold text-foreground">Nuevo rol</h2>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && createMutation.mutate()}
          placeholder="Ej: Vendedor, Administrativo..."
          className="w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted/20"
          >
            Cancelar
          </button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creando...' : 'Crear rol'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RolePermissionsPanel({
  role,
  onClose,
}: {
  role: RoleResponse;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const currentKeys = role.rolePermissions.map((rp) => rp.permission.key);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentKeys));
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(PERMISSION_GROUPS.map(g => g.module)));

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
    JSON.stringify([...selected].sort()) !== JSON.stringify([...currentKeys].sort());

  const saveMutation = useMutation({
    mutationFn: () => rolesApi.setPermissions(role.id, [...selected]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => rolesApi.delete(role.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative z-50 flex h-full w-full max-w-md flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            {role.isSystem ? (
              <ShieldCheck size={18} className="text-muted-foreground/60" />
            ) : (
              <Shield size={18} className="text-muted-foreground" />
            )}
            <span className="font-semibold text-foreground">{role.name}</span>
            {role.isSystem && (
              <span className="rounded-full bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
                Sistema
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!role.isSystem && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Eliminar el rol "${role.name}"?`)) deleteMutation.mutate();
                }}
                className="rounded-md p-1.5 text-destructive/60 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground/60 hover:bg-muted/20"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          <p className="mb-3 text-xs text-muted-foreground">
            {role.isSystem
              ? 'Los permisos del rol de sistema no pueden modificarse.'
              : 'Seleccioná los permisos que tendrá este rol.'}
          </p>
          {PERMISSION_GROUPS.map((group) => {
            const isOpen = openGroups.has(group.module);
            const groupSelected = group.permissions.filter((p) => selected.has(p.key)).length;
            return (
              <div key={group.module} className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.module)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                >
                  <span className="text-sm font-medium text-muted-foreground">{group.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {groupSelected}/{group.permissions.length}
                    </span>
                    {isOpen ? (
                      <ChevronDown size={14} className="text-muted-foreground/60" />
                    ) : (
                      <ChevronRight size={14} className="text-muted-foreground/60" />
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border px-3 py-2 space-y-1.5">
                    {group.permissions.map((perm) => (
                      <label
                        key={perm.key}
                        className={`flex items-center gap-2.5 ${role.isSystem ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(perm.key)}
                          disabled={role.isSystem}
                          onChange={() => toggle(perm.key)}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        <span className="text-sm text-muted-foreground">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!role.isSystem && hasChanges && (
          <div className="border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Guardando...' : 'Guardar permisos'}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function RolesPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleResponse | null>(null);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: rolesApi.list,
  });

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Roles</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Definí los roles y permisos del equipo
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus size={16} />
          Nuevo rol
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground/30" />
          </div>
        ) : roles.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No hay roles creados aún
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Rol
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Permisos
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Tipo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roles.map((role) => {
                const permCount = role.rolePermissions.length;
                return (
                  <tr
                    key={role.id}
                    onClick={() => setSelectedRole(role)}
                    className="cursor-pointer hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {role.isSystem ? (
                          <ShieldCheck size={16} className="shrink-0 text-muted-foreground/60" />
                        ) : (
                          <Shield size={16} className="shrink-0 text-muted-foreground" />
                        )}
                        <span className="font-medium text-foreground">{role.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-sm">
                        {permCount === 0 ? (
                          <span className="text-xs text-muted-foreground/60">Sin permisos</span>
                        ) : permCount > 6 ? (
                          <span className="text-xs text-muted-foreground">
                            {permCount} permisos
                          </span>
                        ) : (
                          role.rolePermissions.slice(0, 6).map((rp) => (
                            <span
                              key={rp.permission.key}
                              className="rounded-md bg-muted/30 px-1.5 py-0.5 text-xs text-muted-foreground"
                            >
                              {getPermissionLabel(rp.permission.key)}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {role.isSystem ? (
                        <span className="rounded-full bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
                          Sistema
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800/30">
                          Personalizado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreateModal && <CreateRoleModal onClose={() => setShowCreateModal(false)} />}
      {selectedRole && (
        <RolePermissionsPanel
          role={selectedRole}
          onClose={() => setSelectedRole(null)}
        />
      )}
    </>
  );
}
