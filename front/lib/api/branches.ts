import { apiClient } from './client';

export interface Branch {
  id: string;
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
  puntoExpedicion: string | null;
  departamentoCodigo: number | null;
  departamentoDesc: string | null;
  distritoCodigo: number | null;
  distritoDesc: string | null;
  ciudadCodigo: number | null;
  ciudadDesc: string | null;
}

export interface CreateBranchPayload {
  name: string;
  address?: string;
  numeroCasa?: string;
  city?: string;
  phone?: string;
  email?: string;
  isMain?: boolean;
  codigoEstablecimiento?: string;
  puntoExpedicion?: string;
  departamentoCodigo?: number;
  departamentoDesc?: string;
  distritoCodigo?: number;
  distritoDesc?: string;
  ciudadCodigo?: number;
  ciudadDesc?: string;
}

export interface UpdateBranchPayload {
  name?: string;
  address?: string;
  numeroCasa?: string;
  city?: string;
  phone?: string;
  email?: string;
  isMain?: boolean;
  isActive?: boolean;
  codigoEstablecimiento?: string;
  puntoExpedicion?: string;
  departamentoCodigo?: number;
  departamentoDesc?: string;
  distritoCodigo?: number;
  distritoDesc?: string;
  ciudadCodigo?: number;
  ciudadDesc?: string;
}

export const branchesApi = {
  listBranches: (): Promise<Branch[]> =>
    apiClient.get('/branches').then((r) => r.data),

  createBranch: (dto: CreateBranchPayload): Promise<Branch> =>
    apiClient.post('/branches', dto).then((r) => r.data),

  updateBranch: (id: string, dto: UpdateBranchPayload): Promise<Branch> =>
    apiClient.patch(`/branches/${id}`, dto).then((r) => r.data),
};
