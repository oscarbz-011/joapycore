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
  weightKg: number | null;
  heightCm: number | null;
  widthCm: number | null;
  depthCm: number | null;
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

export type UpdateProductPayload = Partial<CreateProductPayload> & {
  weightKg?: number | null;
  heightCm?: number | null;
  widthCm?: number | null;
  depthCm?: number | null;
};

export type StockMovementType = 'IN' | 'OUT' | 'ADJUSTMENT';

export interface CreateStockMovementPayload {
  type: StockMovementType;
  quantity: number;
  notes?: string;
}

export interface ProductSupplier {
  id: string;
  supplierId: string;
  productId: string;
  costPrice: number | null;
  isPreferred: boolean;
  supplier: { id: string; name: string; contactName: string | null; email: string | null; phone: string | null };
}

export interface CreateProductSupplierPayload {
  supplierId: string;
  costPrice?: number;
  isPreferred?: boolean;
}

export interface UpdateProductSupplierPayload {
  costPrice?: number | null;
  isPreferred?: boolean;
}

export const inventoryApi = {
  // Products
  listProducts: (filters?: ProductFilters): Promise<Product[]> =>
    apiClient.get('/inventory/products', { params: filters }).then((r) => r.data),

  listProductsWithStock: (filters?: ProductFilters): Promise<ProductWithStock[]> =>
    apiClient.get('/inventory/products/with-stock', { params: filters }).then((r) => r.data),

  addStockMovement: (id: string, dto: CreateStockMovementPayload): Promise<void> =>
    apiClient.post(`/inventory/products/${id}/stock-movements`, dto).then((r) => r.data),

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

  // Product suppliers
  getProductSuppliers: (id: string): Promise<ProductSupplier[]> =>
    apiClient.get(`/inventory/products/${id}/suppliers`).then((r) => r.data),

  addProductSupplier: (id: string, dto: CreateProductSupplierPayload): Promise<ProductSupplier> =>
    apiClient.post(`/inventory/products/${id}/suppliers`, dto).then((r) => r.data),

  updateProductSupplier: (id: string, supplierId: string, dto: UpdateProductSupplierPayload): Promise<ProductSupplier> =>
    apiClient.patch(`/inventory/products/${id}/suppliers/${supplierId}`, dto).then((r) => r.data),

  removeProductSupplier: (id: string, supplierId: string): Promise<void> =>
    apiClient.delete(`/inventory/products/${id}/suppliers/${supplierId}`).then(() => undefined),

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
