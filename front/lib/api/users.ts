import { apiClient } from './client';

export interface UserResponse {
  id: string;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  mustChangePassword: boolean;
  tempPassword: string | null;
  tempPasswordExpiresAt: string | null;
  tenantId: string;
  roles: Array<{ id: string; name: string }>;
  extraPermissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
}

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  username?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface ChangeEmailPayload {
  email: string;
  currentPassword: string;
}

export interface SaveOwnProfileInput {
  currentEmail: string;
  email: string;
  currentPassword: string;
  profile: UpdateProfilePayload;
  sessionRefreshPending: boolean;
}

export interface SaveOwnProfileDependencies {
  changeEmail: (dto: ChangeEmailPayload) => Promise<UserResponse>;
  updateMe: (dto: UpdateProfilePayload) => Promise<UserResponse>;
  refreshSession: () => Promise<void>;
  onEmailCommitted: (user: UserResponse) => void;
  onSessionRefreshCompleted: () => void;
}

export async function saveOwnProfile(
  input: SaveOwnProfileInput,
  dependencies: SaveOwnProfileDependencies,
): Promise<UserResponse> {
  const email = input.email.trim().toLowerCase();
  let sessionRefreshPending = input.sessionRefreshPending;

  if (email !== input.currentEmail.toLowerCase()) {
    const emailUpdatedUser = await dependencies.changeEmail({
      email,
      currentPassword: input.currentPassword,
    });
    sessionRefreshPending = true;
    dependencies.onEmailCommitted(emailUpdatedUser);
  }

  if (sessionRefreshPending) {
    await dependencies.refreshSession();
    dependencies.onSessionRefreshCompleted();
  }

  return dependencies.updateMe(input.profile);
}

export interface Role {
  id: string;
  name: string;
  isSystem: boolean;
}

export const usersApi = {
  listRoles: (): Promise<Role[]> =>
    apiClient.get('/roles').then((r) => r.data),

  getMe: (): Promise<UserResponse> =>
    apiClient.get('/users/me').then((r) => r.data),

  updateMe: (dto: UpdateProfilePayload): Promise<UserResponse> =>
    apiClient.patch('/users/me', dto).then((r) => r.data),

  changePassword: (dto: ChangePasswordPayload): Promise<void> =>
    apiClient.post('/users/me/change-password', dto).then((r) => r.data),

  changeEmail: (dto: ChangeEmailPayload): Promise<UserResponse> =>
    apiClient.post('/users/me/change-email', dto).then((r) => r.data),

  list: (): Promise<UserResponse[]> =>
    apiClient.get('/users').then((r) => r.data),

  getById: (id: string): Promise<UserResponse> =>
    apiClient.get(`/users/${id}`).then((r) => r.data),

  create: (dto: CreateUserPayload): Promise<UserResponse> =>
    apiClient.post('/users', dto).then((r) => r.data),

  deactivate: (id: string): Promise<UserResponse> =>
    apiClient.patch(`/users/${id}/deactivate`).then((r) => r.data),

  reactivate: (id: string): Promise<UserResponse> =>
    apiClient.patch(`/users/${id}/reactivate`).then((r) => r.data),

  resetPassword: (id: string): Promise<{ tempPassword: string }> =>
    apiClient.post(`/users/${id}/reset-password`).then((r) => r.data),

  assignRoles: (id: string, roleIds: string[]): Promise<UserResponse> =>
    apiClient.patch(`/users/${id}/roles`, { roleIds }).then((r) => r.data),

  setExtraPermissions: (id: string, permissions: string[]): Promise<UserResponse> =>
    apiClient.put(`/users/${id}/permissions`, { permissions }).then((r) => r.data),
};
