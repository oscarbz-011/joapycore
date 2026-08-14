import { User } from '@prisma/client';

// tempPasswordEncrypted is internal — never sent to clients
export type SafeUser = Omit<User, 'passwordHash' | 'tempPasswordEncrypted'>;

export type SafeUserWithRoles = SafeUser & {
  roles: Array<{ id: string; name: string }>;
  extraPermissions: string[];
  tempPassword: string | null;
};

export function toSafeUser(user: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _h, tempPasswordEncrypted: _e, ...safe } = user;
  return safe;
}

export function toSafeUserWithRoles(
  user: User & {
    userRoles: Array<{ role: { id: string; name: string } }>;
    userPermissions: Array<{ permission: { key: string } }>;
  },
): SafeUserWithRoles {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _h, tempPasswordEncrypted: _e, userRoles, userPermissions, ...safe } = user;
  return {
    ...safe,
    roles: userRoles.map((ur) => ur.role),
    extraPermissions: userPermissions.map((up) => up.permission.key),
    tempPassword: null, // service sets this after decrypting when applicable
  };
}
