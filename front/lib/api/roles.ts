import { apiClient } from './client';

export interface RolePermission {
  key: string;
}

export interface RoleResponse {
  id: string;
  name: string;
  isSystem: boolean;
  tenantId: string;
  rolePermissions: Array<{ permission: { key: string } }>;
}

export const rolesApi = {
  list: (): Promise<RoleResponse[]> =>
    apiClient.get('/roles').then((r) => r.data),

  getById: (id: string): Promise<RoleResponse> =>
    apiClient.get(`/roles/${id}`).then((r) => r.data),

  create: (dto: { name: string }): Promise<RoleResponse> =>
    apiClient.post('/roles', dto).then((r) => r.data),

  update: (id: string, dto: { name: string }): Promise<RoleResponse> =>
    apiClient.patch(`/roles/${id}`, dto).then((r) => r.data),

  delete: (id: string): Promise<void> =>
    apiClient.delete(`/roles/${id}`).then((r) => r.data),

  setPermissions: (id: string, permissions: string[]): Promise<RoleResponse> =>
    apiClient.post(`/roles/${id}/permissions`, { permissions }).then((r) => r.data),
};
