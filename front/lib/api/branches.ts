import { apiClient } from './client';

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isMain: boolean;
  isActive: boolean;
}

export interface CreateBranchPayload {
  name: string;
  address?: string;
  phone?: string;
  isMain?: boolean;
}

export interface UpdateBranchPayload {
  name?: string;
  address?: string;
  phone?: string;
  isMain?: boolean;
  isActive?: boolean;
}

export const branchesApi = {
  listBranches: (): Promise<Branch[]> =>
    apiClient.get('/branches').then((r) => r.data),

  createBranch: (dto: CreateBranchPayload): Promise<Branch> =>
    apiClient.post('/branches', dto).then((r) => r.data),

  updateBranch: (id: string, dto: UpdateBranchPayload): Promise<Branch> =>
    apiClient.patch(`/branches/${id}`, dto).then((r) => r.data),
};
