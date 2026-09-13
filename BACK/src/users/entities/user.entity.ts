import { User } from '@prisma/client';

// tempPasswordEncrypted y sessionsValidAfter son internos — nunca van al cliente
export type SafeUser = Omit<
  User,
  'passwordHash' | 'tempPasswordEncrypted' | 'sessionsValidAfter'
>;

export type SafeUserWithRoles = SafeUser & {
  roles: Array<{ id: string; name: string }>;
  extraPermissions: string[];
  tempPassword: string | null;
};

export function toSafeUser(user: User): SafeUser {
  const {
    passwordHash: _h,
    tempPasswordEncrypted: _e,
    sessionsValidAfter: _s,
    ...safe
  } = user;
  return safe;
}

export function toSafeUserWithRoles(
  user: User & {
    userRoles: Array<{ role: { id: string; name: string } }>;
    userPermissions: Array<{ permission: { key: string } }>;
  },
): SafeUserWithRoles {
  const {
    passwordHash: _h,
    tempPasswordEncrypted: _e,
    sessionsValidAfter: _s,
    userRoles,
    userPermissions,
    ...safe
  } = user;
  return {
    ...safe,
    roles: userRoles.map((ur) => ur.role),
    extraPermissions: userPermissions.map((up) => up.permission.key),
    tempPassword: null, // service sets this after decrypting when applicable
  };
}
