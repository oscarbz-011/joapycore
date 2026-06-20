import { User } from '@prisma/client';

export type SafeUser = Omit<User, 'passwordHash'>;

export type SafeUserWithRoles = SafeUser & {
  roles: Array<{ id: string; name: string }>;
  extraPermissions: string[];
};

export function toSafeUser(user: User): SafeUser {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export function toSafeUserWithRoles(
  user: User & {
    userRoles: Array<{ role: { id: string; name: string } }>;
    userPermissions: Array<{ permission: { key: string } }>;
  },
): SafeUserWithRoles {
  const {
    passwordHash: _passwordHash,
    userRoles,
    userPermissions,
    ...safeUser
  } = user;
  return {
    ...safeUser,
    roles: userRoles.map((ur) => ur.role),
    extraPermissions: userPermissions.map((up) => up.permission.key),
  };
}
