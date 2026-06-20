import { apiClient } from './client';

export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'INACTIVE';
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
  password: string;
}

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export const usersApi = {
  getMe: (): Promise<UserResponse> =>
    apiClient.get('/users/me').then((r) => r.data),

  updateMe: (dto: UpdateProfilePayload): Promise<UserResponse> =>
    apiClient.patch('/users/me', dto).then((r) => r.data),

  changePassword: (dto: ChangePasswordPayload): Promise<void> =>
    apiClient.post('/users/me/change-password', dto).then((r) => r.data),

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
