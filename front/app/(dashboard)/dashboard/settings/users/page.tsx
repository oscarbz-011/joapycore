'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { usersApi, type UserResponse } from '../../../../../lib/api/users';
import { UserStatusBadge } from './_components/user-status-badge';
import { CreateUserModal } from './_components/create-user-modal';
import { UserDetailPanel } from './_components/user-detail-panel';
import { useAuth } from '../../../../../lib/auth-context';
import { Button } from '@/components/ui/button';

export default function UsersPage() {
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null);
  const { jwtPayload } = useAuth();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  });

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Usuarios</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Gestioná el equipo de tu empresa
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <UserPlus size={16} />
          Nuevo usuario
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground/30" />
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No hay usuarios registrados aún
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Usuario
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Nombre de usuario
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Roles
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Permisos extra
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Miembro desde
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className="cursor-pointer hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/30 text-xs font-semibold text-muted-foreground">
                        {user.firstName[0]}
                        {user.lastName[0]}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {user.firstName} {user.lastName}
                          {user.id === jwtPayload?.sub && (
                            <span className="ml-2 text-xs text-muted-foreground/60">
                              (vos)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{user.username || '—'}</td>
                  <td className="px-4 py-3">
                    <UserStatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground/60">Sin rol</span>
                      ) : (
                        user.roles.map((role) => (
                          <span
                            key={role.id}
                            className="rounded-md bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground"
                          >
                            {role.name}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.extraPermissions.length > 0 ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800/30">
                        +{user.extraPermissions.length}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("es-PY", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <CreateUserModal onClose={() => setShowModal(false)} />}

      {selectedUser && (
        <UserDetailPanel
          key={selectedUser.id}
          user={selectedUser}
          currentUserId={jwtPayload?.sub}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </>
  );
}
