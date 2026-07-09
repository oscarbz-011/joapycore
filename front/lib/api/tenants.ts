import { apiClient } from './client';

export interface TenantResponse {
  id: string;
  name: string;
  industry: string | null;
  plan: string;
  status: string;
  razonSocial: string | null;
  ruc: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  department: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  employeeCount: 'RANGE_1_5' | 'RANGE_6_20' | 'RANGE_21_50' | 'RANGE_51_200' | 'RANGE_201' | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantModuleResponse {
  id: string;
  tenantId: string;
  moduleName: string;
  active: boolean;
  activatedAt: string | null;
}

export interface UpdateTenantPayload {
  name?: string;
  razonSocial?: string;
  ruc?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  department?: string;
  country?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  employeeCount?: 'RANGE_1_5' | 'RANGE_6_20' | 'RANGE_21_50' | 'RANGE_51_200' | 'RANGE_201';
  currency?: string;
}

export const tenantsApi = {
  getMe: (): Promise<TenantResponse> =>
    apiClient.get('/tenants/me').then((r) => r.data),

  updateMe: (dto: UpdateTenantPayload): Promise<TenantResponse> =>
    apiClient.patch('/tenants/me', dto).then((r) => r.data),

  listModules: (): Promise<TenantModuleResponse[]> =>
    apiClient.get('/tenants/me/modules').then((r) => r.data),

  toggleModule: (moduleName: string, active: boolean): Promise<TenantModuleResponse[]> =>
    apiClient.patch(`/tenants/me/modules/${moduleName}`, { active }).then((r) => r.data),
};
