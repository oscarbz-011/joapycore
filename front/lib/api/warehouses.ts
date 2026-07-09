import { apiClient } from './client';

export interface Warehouse {
  id: string;
  name: string;
  branchId: string | null;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
  branch: { id: string; name: string } | null;
}

export interface CreateWarehousePayload {
  name: string;
  branchId?: string;
  address?: string;
  isDefault?: boolean;
}

export interface UpdateWarehousePayload {
  name?: string;
  branchId?: string;
  address?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export const warehousesApi = {
  listWarehouses: (): Promise<Warehouse[]> =>
    apiClient.get('/warehouses').then((r) => r.data),

  createWarehouse: (dto: CreateWarehousePayload): Promise<Warehouse> =>
    apiClient.post('/warehouses', dto).then((r) => r.data),

  updateWarehouse: (id: string, dto: UpdateWarehousePayload): Promise<Warehouse> =>
    apiClient.patch(`/warehouses/${id}`, dto).then((r) => r.data),
};
