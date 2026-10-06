import { apiClient, LONG_REQUEST_TIMEOUT_MS } from './client';

export type PurchaseType = 'LOCAL' | 'IMPORT';
export type PurchaseOrderStatus =
  | 'PENDING'
  | 'SENT'
  | 'CONFIRMED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

// ── Catálogo del proveedor ────────────────────────────────────────────────
// La lista de precios tal como la manda el proveedor, ANTES de mapearla al
// catálogo interno. `productId` en null = ítem todavía sin vincular, que es
// justamente lo que permite importar sin tener que crear productos primero.
// Ver ARCHITECTURE.md v0.56.

export interface SupplierCatalogItem {
  id: string;
  supplierId: string;
  supplierSku: string;
  description: string;
  price: number | null;
  supplierUnit: string | null;
  conversionFactor: number | null;
  validFrom: string | null;
  validTo: string | null;
  productId: string | null;
  product: { id: string; name: string; unit: string } | null;
}

/** Vigencia de un precio en días de calendario (AAAA-MM-DD). */
export interface CatalogValidity {
  validFrom?: string;
  validTo?: string;
}

export interface CatalogImportResult {
  imported: number;
  /** Filas rechazadas, con el número de fila tal como se ve en Excel. */
  errors: { row: number; message: string }[];
  totalRows: number;
}

export interface CatalogFilters {
  search?: string;
  unmapped?: boolean;
  onlyValid?: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  isImporter: boolean;
  isActive: boolean;
  paymentTermDays: number | null;
}

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitCost: number;
  receivedQty: number;
  // Código y descripción del proveedor, si la línea salió de su catálogo.
  supplierSku: string | null;
  supplierDescription: string | null;
  product: {
    id: string;
    name: string;
    model: string | null;
    isSerialized: boolean;
    usesLots: boolean;
    unit: string;
  };
}

/** Una entrada del historial de estados de la orden. */
export interface PurchaseOrderStatusChange {
  id: string;
  fromStatus: PurchaseOrderStatus | null;
  toStatus: PurchaseOrderStatus;
  reason: string | null;
  createdAt: string;
  changedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface PurchaseOrder {
  id: string;
  /** OC-AA-000001. */
  orderNumber: string | null;
  /** PDF de la orden; null hasta que se genera. */
  pdfFileId: string | null;
  status: PurchaseOrderStatus;
  purchaseType: PurchaseType;
  orderDate: string;
  expectedDate: string | null;
  exchangeRate: number | null;
  customsDuty: number | null;
  customsRef: string | null;
  notes: string | null;
  supplier: { id: string; name: string; email: string | null };
  items: PurchaseOrderItem[];
  /** Solo viene al pedir una orden puntual, no en el listado. */
  statusChanges?: PurchaseOrderStatusChange[];
}

export interface CreatePurchaseOrderItem {
  productId: string;
  quantity: number;
  unitCost: number;
  /** Ítem del catálogo del proveedor del que sale la línea. */
  catalogItemId?: string;
}

export interface CreatePurchaseOrderPayload {
  supplierId: string;
  purchaseType: PurchaseType;
  orderDate: string;
  expectedDate?: string;
  exchangeRate?: number;
  customsDuty?: number;
  customsRef?: string;
  notes?: string;
  items: CreatePurchaseOrderItem[];
}

export interface PurchaseReceiptItem {
  id: string;
  purchaseOrderItemId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  batchNumber: string | null;
  expiresAt: string | null;
  product: { id: string; name: string; model: string | null };
}

export interface PurchaseReceipt {
  id: string;
  purchaseOrderId: string;
  receiptNumber: number;
  warehouseId: string | null;
  receivedAt: string;
  notes: string | null;
  items: PurchaseReceiptItem[];
  warehouse: { id: string; name: string } | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
}

export interface ReceiptItemPayload {
  purchaseOrderItemId: string;
  quantity: number;
  batchNumber?: string;
  expiresAt?: string;
  serialNumbers?: string[];
}

export interface CreatePurchaseReceiptPayload {
  warehouseId?: string;
  notes?: string;
  items: ReceiptItemPayload[];
}

export interface CreateSupplierPayload {
  name: string;
  // null borra el dato al editar.
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  isImporter?: boolean;
  paymentTermDays?: number;
}

export type UpdateSupplierPayload = Partial<CreateSupplierPayload>;

export const procurementApi = {
  // Purchase orders
  listOrders: (): Promise<PurchaseOrder[]> =>
    apiClient.get('/procurement/purchase-orders').then((r) => r.data),

  getOrder: (id: string): Promise<PurchaseOrder> =>
    apiClient.get(`/procurement/purchase-orders/${id}`).then((r) => r.data),

  createOrder: (dto: CreatePurchaseOrderPayload): Promise<PurchaseOrder> =>
    apiClient.post('/procurement/purchase-orders', dto).then((r) => r.data),

  confirmOrder: (id: string): Promise<PurchaseOrder> =>
    apiClient.post(`/procurement/purchase-orders/${id}/confirm`).then((r) => r.data),

  /** Devuelve la orden con su PDF, generándolo si todavía no existe. */
  orderPdf: (id: string): Promise<PurchaseOrder> =>
    apiClient
      .post(`/procurement/purchase-orders/${id}/pdf`, undefined, {
        timeout: LONG_REQUEST_TIMEOUT_MS,
      })
      .then((r) => r.data),

  /** Sin `to`, va al email cargado en el proveedor. */
  emailOrder: (id: string, to?: string): Promise<{ to: string; accepted: string[] }> =>
    apiClient
      .post(`/procurement/purchase-orders/${id}/email`, to ? { to } : {}, {
        timeout: LONG_REQUEST_TIMEOUT_MS,
      })
      .then((r) => r.data),

  sendOrder: (id: string): Promise<PurchaseOrder> =>
    apiClient.post(`/procurement/purchase-orders/${id}/send`).then((r) => r.data),

  cancelOrder: (id: string, reason: string): Promise<PurchaseOrder> =>
    apiClient
      .post(`/procurement/purchase-orders/${id}/cancel`, { reason })
      .then((r) => r.data),

  createReceipt: (id: string, dto: CreatePurchaseReceiptPayload): Promise<PurchaseReceipt> =>
    apiClient.post(`/procurement/purchase-orders/${id}/receipts`, dto).then((r) => r.data),

  listReceipts: (orderId: string): Promise<PurchaseReceipt[]> =>
    apiClient.get(`/procurement/purchase-orders/${orderId}/receipts`).then((r) => r.data),

  getReceipt: (id: string): Promise<PurchaseReceipt> =>
    apiClient.get(`/procurement/purchase-receipts/${id}`).then((r) => r.data),

  // Suppliers
  // ── Catálogo del proveedor ──────────────────────────────────────────────
  listCatalog: (supplierId: string, filters: CatalogFilters = {}): Promise<SupplierCatalogItem[]> =>
    apiClient
      .get(`/procurement/suppliers/${supplierId}/catalog`, { params: filters })
      .then((r) => r.data),

  // El apiClient fuerza 'application/json' por defecto, así que hay que pisarlo
  // acá: sin esto el multipart sale sin boundary, multer no encuentra el
  // archivo y el backend responde 400. Mismo patrón que files.ts / sifen.ts.
  importCatalog: (
    supplierId: string,
    file: File,
    validity: CatalogValidity = {},
  ): Promise<CatalogImportResult> => {
    const body = new FormData();
    body.append('file', file);
    if (validity.validFrom) body.append('validFrom', validity.validFrom);
    if (validity.validTo) body.append('validTo', validity.validTo);
    return apiClient
      .post(`/procurement/suppliers/${supplierId}/catalog/import`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: LONG_REQUEST_TIMEOUT_MS,
      })
      .then((r) => r.data);
  },

  updateCatalogItem: (
    id: string,
    dto: {
      description?: string;
      price?: number;
      supplierUnit?: string;
      conversionFactor?: number;
      // null borra la fecha.
      validFrom?: string | null;
      validTo?: string | null;
    },
  ): Promise<SupplierCatalogItem> =>
    apiClient.patch(`/procurement/catalog/${id}`, dto).then((r) => r.data),

  /** productId null desvincula el ítem sin borrarlo. */
  mapCatalogItem: (id: string, productId: string | null): Promise<SupplierCatalogItem> =>
    apiClient.patch(`/procurement/catalog/${id}/product`, { productId }).then((r) => r.data),

  removeCatalogItem: (id: string): Promise<void> =>
    apiClient.delete(`/procurement/catalog/${id}`).then(() => undefined),

  listSuppliers: (): Promise<Supplier[]> =>
    apiClient.get('/procurement/suppliers').then((r) => r.data),

  getSupplier: (id: string): Promise<Supplier> =>
    apiClient.get(`/procurement/suppliers/${id}`).then((r) => r.data),

  createSupplier: (dto: CreateSupplierPayload): Promise<Supplier> =>
    apiClient.post('/procurement/suppliers', dto).then((r) => r.data),

  updateSupplier: (id: string, dto: UpdateSupplierPayload): Promise<Supplier> =>
    apiClient.patch(`/procurement/suppliers/${id}`, dto).then((r) => r.data),

  deleteSupplier: (id: string): Promise<void> =>
    apiClient.delete(`/procurement/suppliers/${id}`).then((r) => r.data),
};
