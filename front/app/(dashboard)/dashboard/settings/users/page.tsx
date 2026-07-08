'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { usersApi, type UserResponse } from '../../../../../lib/api/users';
import { UserStatusBadge } from './_components/user-status-badge';
import { CreateUserModal } from './_components/create-user-modal';
import { UserDetailPanel } from './_components/user-detail-panel';
import { useAuth } from '../../../../../lib/auth-context';

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
          <h1 className="text-xl font-semibold text-ink">Usuarios</h1>
          <p className="mt-0.5 text-sm text-muted">
            Gestioná el equipo de tu empresa
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-80"
        >
          <UserPlus size={16} />
          Nuevo usuario
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-slate-600" />
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted">
            No hay usuarios registrados aún
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Usuario
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Nombre de usuario
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Roles
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Permisos extra
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  Miembro desde
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className="cursor-pointer hover:bg-surface-2 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted">
                        {user.firstName[0]}
                        {user.lastName[0]}
                      </div>
                      <div>
                        <p className="font-medium text-ink">
                          {user.firstName} {user.lastName}
                          {user.id === jwtPayload?.sub && (
                            <span className="ml-2 text-xs text-faint">
                              (vos)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{user.username || '—'}</td>
                  <td className="px-4 py-3">
                    <UserStatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length === 0 ? (
                        <span className="text-xs text-faint">Sin rol</span>
                      ) : (
                        user.roles.map((role) => (
                          <span
                            key={role.id}
                            className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted"
                          >
                            {role.name}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.extraPermissions.length > 0 ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                        +{user.extraPermissions.length}
                      </span>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {new Date(user.createdAt).toLocaleDateString("es-AR", {
                      day: "2-digit",
                      month: "short",
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
