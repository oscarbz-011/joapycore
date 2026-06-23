import { apiClient } from './client';

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  isActive: boolean;
}

export type SaleOrderStatus = 'PENDING' | 'CONFIRMED' | 'INVOICED' | 'CANCELLED';

export interface SaleOrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  product: {
    id: string;
    name: string;
    model: string | null;
    isSerialized: boolean;
    unit: string;
  };
  productUnits: { id: string; serialNumber: string }[];
}

export interface SaleOrder {
  id: string;
  status: SaleOrderStatus;
  orderDate: string;
  notes: string | null;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  };
  items: SaleOrderItem[];
  invoice: { id: string; status: string } | null;
}

export interface CreateSaleOrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  serialNumbers?: string[];
}

export interface CreateSaleOrderPayload {
  customerId: string;
  notes?: string;
  items: CreateSaleOrderItem[];
}

export interface CreateCustomerPayload {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
}

export type UpdateCustomerPayload = Partial<CreateCustomerPayload>;

export const salesApi = {
  // Orders
  listOrders: (): Promise<SaleOrder[]> =>
    apiClient.get('/sales/orders').then((r) => r.data),

  getOrder: (id: string): Promise<SaleOrder> =>
    apiClient.get(`/sales/orders/${id}`).then((r) => r.data),

  createOrder: (dto: CreateSaleOrderPayload): Promise<SaleOrder> =>
    apiClient.post('/sales/orders', dto).then((r) => r.data),

  confirmOrder: (id: string): Promise<SaleOrder> =>
    apiClient.post(`/sales/orders/${id}/confirm`).then((r) => r.data),

  cancelOrder: (id: string): Promise<SaleOrder> =>
    apiClient.post(`/sales/orders/${id}/cancel`).then((r) => r.data),

  // Customers
  listCustomers: (): Promise<Customer[]> =>
    apiClient.get('/sales/customers').then((r) => r.data),

  getCustomer: (id: string): Promise<Customer> =>
    apiClient.get(`/sales/customers/${id}`).then((r) => r.data),

  createCustomer: (dto: CreateCustomerPayload): Promise<Customer> =>
    apiClient.post('/sales/customers', dto).then((r) => r.data),

  updateCustomer: (id: string, dto: UpdateCustomerPayload): Promise<Customer> =>
    apiClient.patch(`/sales/customers/${id}`, dto).then((r) => r.data),

  deleteCustomer: (id: string): Promise<void> =>
    apiClient.delete(`/sales/customers/${id}`).then((r) => r.data),
};
