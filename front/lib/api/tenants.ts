import { apiClient } from './client';

export interface ActividadEconomica {
  codigo: number;
  descripcion: string;
}

export interface TenantResponse {
  id: string;
  name: string;
  industry: string | null;
  plan: string;
  status: string;
  razonSocial: string | null;
  nombreFantasia: string | null;
  ruc: string | null;
  address: string | null;
  numeroCasa: string | null;
  postalCode: string | null;
  city: string | null;
  department: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  employeeCount: 'RANGE_1_5' | 'RANGE_6_20' | 'RANGE_21_50' | 'RANGE_51_200' | 'RANGE_201' | null;
  currency: string;
  // SIFEN — datos fiscales
  timbradoNumero: string | null;
  timbradoFecha: string | null;
  tipoContribuyente: number | null;
  tipoRegimen: number | null;
  actividadesEconomicas: ActividadEconomica[] | null;
  departamentoCodigo: number | null;
  departamentoDesc: string | null;
  distritoCodigo: number | null;
  distritoDesc: string | null;
  ciudadCodigo: number | null;
  ciudadDesc: string | null;
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
  nombreFantasia?: string;
  ruc?: string;
  address?: string;
  numeroCasa?: string;
  postalCode?: string;
  city?: string;
  department?: string;
  country?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  employeeCount?: 'RANGE_1_5' | 'RANGE_6_20' | 'RANGE_21_50' | 'RANGE_51_200' | 'RANGE_201';
  currency?: string;
  // SIFEN — datos fiscales
  timbradoNumero?: string;
  timbradoFecha?: string;
  tipoContribuyente?: number;
  tipoRegimen?: number;
  actividadesEconomicas?: ActividadEconomica[];
  departamentoCodigo?: number;
  departamentoDesc?: string;
  distritoCodigo?: number;
  distritoDesc?: string;
  ciudadCodigo?: number;
  ciudadDesc?: string;
}

export interface BranchResponse {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  numeroCasa: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  isMain: boolean;
  isActive: boolean;
  // SIFEN — establecimiento
  codigoEstablecimiento: string | null;
  departamentoCodigo: number | null;
  departamentoDesc: string | null;
  distritoCodigo: number | null;
  distritoDesc: string | null;
  ciudadCodigo: number | null;
  ciudadDesc: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertBranchPayload {
  name?: string;
  address?: string;
  numeroCasa?: string;
  phone?: string;
  email?: string;
  isMain?: boolean;
  isActive?: boolean;
  codigoEstablecimiento?: string;
  departamentoCodigo?: number;
  departamentoDesc?: string;
  distritoCodigo?: number;
  distritoDesc?: string;
  ciudadCodigo?: number;
  ciudadDesc?: string;
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

  listBranches: (): Promise<BranchResponse[]> =>
    apiClient.get('/branches').then((r) => r.data),

  updateBranch: (id: string, dto: UpsertBranchPayload): Promise<BranchResponse> =>
    apiClient.patch(`/branches/${id}`, dto).then((r) => r.data),
};
