import { apiClient } from './client';

export type PurchaseType = 'LOCAL' | 'IMPORT';
export type PurchaseOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

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
}

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitCost: number;
  receivedQty: number;
  product: { id: string; name: string; model: string | null; isSerialized: boolean; unit: string };
}

export interface PurchaseOrder {
  id: string;
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
}

export interface CreatePurchaseOrderItem {
  productId: string;
  quantity: number;
  unitCost: number;
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

export interface ReceiveItem {
  itemId: string;
  serialNumbers?: string[];
}

export interface ReceiveItemsPayload {
  items: ReceiveItem[];
}

export interface CreateSupplierPayload {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  isImporter?: boolean;
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

  receiveItems: (id: string, dto: ReceiveItemsPayload): Promise<PurchaseOrder> =>
    apiClient.post(`/procurement/purchase-orders/${id}/receive`, dto).then((r) => r.data),

  // Suppliers
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
