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

export type MarkupType = 'PERCENTAGE' | 'FIXED';

export type OrderChannel = 'NORMAL' | 'POS' | 'ECOMMERCE';

export const SALES_CHANNEL_LABEL: Record<OrderChannel, string> = {
  NORMAL: 'Venta normal',
  POS: 'POS',
  ECOMMERCE: 'ECOMMERCE',
};

// Estado de la FICHA del producto, no del stock (el stock son movimientos,
// ver StockMovement). DRAFT = creada incompleta, no opera; ACTIVE = completa,
// se puede comprar y vender; INACTIVE = descontinuada; BLOCKED = restringida.
// Ver ARCHITECTURE.md v0.51.
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  INACTIVE: 'Descontinuado',
  BLOCKED: 'Bloqueado',
};

// De dónde sale el stock del producto. El proyecto es multi-rubro: una
// ferretería revende lo que compra, una carpintería fabrica lo que vende y
// solo compra materia prima. Es por producto, no por rubro — el rubro del
// tenant solo define el default al crear. Ver ARCHITECTURE.md v0.52.
export type ProductKind = 'RESALE' | 'RAW_MATERIAL' | 'MANUFACTURED';

export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = {
  RESALE: 'Reventa',
  RAW_MATERIAL: 'Materia prima',
  MANUFACTURED: 'Fabricado',
};

export const PRODUCT_KIND_HINT: Record<ProductKind, string> = {
  RESALE: 'Se compra terminado a un proveedor y se vende tal cual.',
  RAW_MATERIAL: 'Se compra para consumir en producción — no se vende en el mostrador.',
  MANUFACTURED: 'Se produce internamente a partir de una receta — no se compra a proveedores.',
};

export interface Product {
  id: string;
  name: string;
  model: string | null;
  description: string | null;
  isSerialized: boolean;
  usesLots: boolean;
  unit: string;
  weightKg: number | null;
  heightCm: number | null;
  widthCm: number | null;
  depthCm: number | null;
  // null = precio pendiente (ficha en DRAFT), distinto de 0 (precio real).
  costPrice: number | null;
  salePrice: number | null;
  additionalMarkup: number | null;
  additionalMarkupType: MarkupType | null;
  stockMin: number;
  status: ProductStatus;
  kind: ProductKind;
  isPurchasable: boolean;
  salesChannels: OrderChannel[];
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
  warehouseId: string | null;
  status: 'IN_STOCK' | 'SOLD' | 'RESERVED' | 'DAMAGED' | 'ADJUSTED_OUT';
}

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  brandId?: string;
  isSerialized?: boolean;
  status?: ProductStatus;
  kind?: ProductKind;
  // Los usan los selectores de producto de cada flujo para no ofrecer lo que
  // el backend después va a rechazar.
  isPurchasable?: boolean;
  salesChannel?: OrderChannel;
}

export interface CreateProductPayload {
  categoryId: string;
  brandId: string;
  name: string;
  model?: string;
  description?: string;
  isSerialized: boolean;
  usesLots?: boolean;
  unit?: string;
  // Opcionales: sin precio el producto se crea en DRAFT (ver ProductStatus).
  costPrice?: number;
  salePrice?: number;
  additionalMarkup?: number;
  additionalMarkupType?: MarkupType;
  // Si se omite, el backend lo deriva del rubro del tenant.
  kind?: ProductKind;
  isPurchasable?: boolean;
  salesChannels?: OrderChannel[];
}

export type UpdateProductPayload =
  Omit<Partial<CreateProductPayload>, 'additionalMarkup' | 'additionalMarkupType'> & {
    weightKg?: number | null;
    heightCm?: number | null;
    widthCm?: number | null;
    depthCm?: number | null;
    additionalMarkup?: number | null;
    additionalMarkupType?: MarkupType | null;
    status?: ProductStatus;
    kind?: ProductKind;
    isPurchasable?: boolean;
    salesChannels?: OrderChannel[];
  };

export type MovementReason =
  | 'PURCHASE'
  | 'CUSTOMER_RETURN'
  | 'ADJUSTMENT'
  | 'TRANSFER'
  | 'INITIAL'
  | 'SALE_OUT'
  | 'SALE_REVERSAL'
  // Generados por una orden de producción: sale la materia prima, entra el
  // producto fabricado. Ver ARCHITECTURE.md v0.52.
  | 'PRODUCTION_IN'
  | 'PRODUCTION_OUT';

export interface StockMovement {
  id: string;
  productId: string;
  product: { id: string; name: string; model: string | null };
  warehouseId: string | null;
  warehouse: { id: string; name: string } | null;
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER';
  reason: MovementReason | null;
  quantity: number;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateStockMovementPayload {
  reason: MovementReason;
  quantity: number;
  direction?: 'IN' | 'OUT';
  warehouseId?: string;
  toWarehouseId?: string;
  serialNumbers?: string[];
  notes?: string;
}

export interface CreateGlobalMovementPayload extends CreateStockMovementPayload {
  productId: string;
}

export interface MovementFilters {
  productId?: string;
  warehouseId?: string;
  reason?: MovementReason;
  take?: number;
  skip?: number;
}

export interface StockWarehouse {
  id: string;
  name: string;
  isActive: boolean;
}

export interface StockWarehouseQuantity {
  warehouseId: string;
  warehouseName: string;
  isActive: boolean;
  quantity: number;
}

export interface StockRow {
  product: Pick<Product, 'id' | 'name' | 'model' | 'salesChannels'> & {
    category: { id: string; name: string } | null;
    brand: { id: string; name: string } | null;
  };
  totalStock: number;
  stockByWarehouse: StockWarehouseQuantity[];
  unassignedStock: number;
}

export interface StockResult {
  warehouses: StockWarehouse[];
  items: StockRow[];
}

export interface StockFilters {
  search?: string;
  categoryId?: string;
  brandId?: string;
  warehouseId?: string;
}

export interface ProductBatch {
  id: string;
  productId: string;
  batchNumber: string;
  entryDate: string;
  unitCost: number;
  quantity: number;
  remainingQty: number;
  expiresAt: string | null;
  product?: { id: string; name: string; model: string | null };
}

export type StockInitialSourceType =
  | 'PURCHASE'
  | 'MIGRATION'
  | 'PRODUCTION'
  | 'DONATION'
  | 'OTHER';

export interface CreateInitialStockPayload {
  productId: string;
  quantity: number;
  warehouseId: string;
  branchId?: string;
  initialSourceType: StockInitialSourceType;
  batchNumber?: string;
  unitCost?: number;
  expiresAt?: string;
  serialNumbers?: string[];
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

const DECIMAL_FIELDS = ['costPrice', 'salePrice', 'additionalMarkup'] as const;
type DecimalField = (typeof DECIMAL_FIELDS)[number];

/**
 * El backend serializa los Decimal de Prisma como texto ("400000"). Se pasan
 * a número al recibirlos: si no, un formulario que los reenvía sin tocarlos
 * manda texto y el backend lo rechaza ("costPrice must be a positive number").
 */
export function normalizeProduct<
  T extends Partial<Record<DecimalField, unknown>>,
>(product: T): T {
  const normalized: Record<string, unknown> = { ...product };
  for (const field of DECIMAL_FIELDS) {
    const value = product[field];
    if (typeof value === 'string') normalized[field] = Number(value);
  }
  return normalized as T;
}

export const inventoryApi = {
  // Products
  listProducts: (filters?: ProductFilters): Promise<Product[]> =>
    apiClient
      .get('/inventory/products', { params: filters })
      .then((r) => r.data.map(normalizeProduct)),

  listProductsWithStock: (filters?: ProductFilters): Promise<ProductWithStock[]> =>
    apiClient
      .get('/inventory/products/with-stock', { params: filters })
      .then((r) => r.data.map(normalizeProduct)),

  listMovements: (filters?: MovementFilters): Promise<StockMovement[]> =>
    apiClient.get('/inventory/movements', { params: filters }).then((r) => r.data),

  createMovement: (dto: CreateGlobalMovementPayload): Promise<StockMovement | StockMovement[]> =>
    apiClient.post('/inventory/movements', dto).then((r) => r.data),

  getStock: (filters?: StockFilters): Promise<StockResult> =>
    apiClient.get('/inventory/stock', { params: filters }).then((r) => r.data),

  getProduct: (id: string): Promise<ProductWithStock> =>
    apiClient.get(`/inventory/products/${id}`).then((r) => normalizeProduct(r.data)),

  createProduct: (dto: CreateProductPayload): Promise<Product> =>
    apiClient.post('/inventory/products', dto).then((r) => normalizeProduct(r.data)),

  updateProduct: (id: string, dto: UpdateProductPayload): Promise<Product> =>
    apiClient
      .patch(`/inventory/products/${id}`, dto)
      .then((r) => normalizeProduct(r.data)),

  deleteProduct: (id: string): Promise<void> =>
    apiClient.delete(`/inventory/products/${id}`).then((r) => r.data),

  getProductUnits: (id: string): Promise<ProductUnit[]> =>
    apiClient.get(`/inventory/products/${id}/units`).then((r) => r.data),

  // Batches (lotes)
  listProductBatches: (id: string): Promise<ProductBatch[]> =>
    apiClient.get(`/inventory/products/${id}/batches`).then((r) => r.data),

  listAllBatches: (filters?: { productId?: string }): Promise<ProductBatch[]> =>
    apiClient.get('/inventory/batches', { params: filters }).then((r) => r.data),

  // Carga inicial — flujo propio, no pasa por Compras
  createInitialStock: (dto: CreateInitialStockPayload): Promise<void> =>
    apiClient.post('/inventory/stock-entries/initial', dto).then((r) => r.data),

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
