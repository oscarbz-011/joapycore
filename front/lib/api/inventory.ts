import { apiClient } from './client';

export interface Category {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Brand {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  name: string;
  model: string | null;
  description: string | null;
  isSerialized: boolean;
  unit: string;
  costPrice: number;
  salePrice: number;
  isActive: boolean;
  deletedAt: string | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
}

export interface ProductWithStock extends Product {
  stock: number;
}

export interface ProductUnit {
  id: string;
  serialNumber: string;
  status: 'IN_STOCK' | 'SOLD' | 'RESERVED';
}

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  brandId?: string;
  isSerialized?: boolean;
  isActive?: boolean;
}

export interface CreateProductPayload {
  categoryId: string;
  brandId: string;
  name: string;
  model?: string;
  description?: string;
  isSerialized: boolean;
  unit?: string;
  costPrice: number;
  salePrice: number;
}

export type UpdateProductPayload = Partial<CreateProductPayload>;

export const inventoryApi = {
  // Products
  listProducts: (filters?: ProductFilters): Promise<Product[]> =>
    apiClient.get('/inventory/products', { params: filters }).then((r) => r.data),

  getProduct: (id: string): Promise<ProductWithStock> =>
    apiClient.get(`/inventory/products/${id}`).then((r) => r.data),

  createProduct: (dto: CreateProductPayload): Promise<Product> =>
    apiClient.post('/inventory/products', dto).then((r) => r.data),

  updateProduct: (id: string, dto: UpdateProductPayload): Promise<Product> =>
    apiClient.patch(`/inventory/products/${id}`, dto).then((r) => r.data),

  deleteProduct: (id: string): Promise<void> =>
    apiClient.delete(`/inventory/products/${id}`).then((r) => r.data),

  getProductUnits: (id: string): Promise<ProductUnit[]> =>
    apiClient.get(`/inventory/products/${id}/units`).then((r) => r.data),

  addProductUnits: (id: string, serialNumbers: string[]): Promise<{ created: number }> =>
    apiClient.post(`/inventory/products/${id}/units`, { serialNumbers }).then((r) => r.data),

  // Categories
  listCategories: (): Promise<Category[]> =>
    apiClient.get('/inventory/categories').then((r) => r.data),

  createCategory: (name: string): Promise<Category> =>
    apiClient.post('/inventory/categories', { name }).then((r) => r.data),

  updateCategory: (id: string, dto: { name?: string; isActive?: boolean }): Promise<Category> =>
    apiClient.patch(`/inventory/categories/${id}`, dto).then((r) => r.data),

  // Brands
  listBrands: (): Promise<Brand[]> =>
    apiClient.get('/inventory/brands').then((r) => r.data),

  createBrand: (name: string): Promise<Brand> =>
    apiClient.post('/inventory/brands', { name }).then((r) => r.data),

  updateBrand: (id: string, dto: { name?: string; isActive?: boolean }): Promise<Brand> =>
    apiClient.patch(`/inventory/brands/${id}`, dto).then((r) => r.data),
};
