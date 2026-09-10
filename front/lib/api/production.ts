import { apiClient } from './client';

// Producción: recetas (de qué está hecho un producto fabricado) y órdenes de
// producción (consumen materia prima y dan de alta el terminado). Solo aplica
// a rubros que fabrican lo que venden — ver ProductKind en inventory.ts.

export interface ProductComponent {
  id: string;
  productId: string;
  componentId: string;
  quantity: number;
  notes: string | null;
  component: {
    id: string;
    name: string;
    unit: string;
    kind: string;
    costPrice: number | null;
  };
}

export type ProductionOrderStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export const PRODUCTION_STATUS_LABEL: Record<ProductionOrderStatus, string> = {
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export interface ProductionOrderItem {
  id: string;
  componentId: string;
  plannedQuantity: number;
  usedQuantity: number;
  component: { id: string; name: string; unit: string; costPrice: number | null };
}

export interface ProductionOrder {
  id: string;
  orderNumber: number;
  productId: string;
  quantity: number;
  status: ProductionOrderStatus;
  warehouseId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  product: { id: string; name: string; unit: string };
  warehouse: { id: string; name: string } | null;
  items: ProductionOrderItem[];
}

export const productionApi = {
  // ── Recetas ───────────────────────────────────────────────────────────
  getRecipe: (productId: string): Promise<ProductComponent[]> =>
    apiClient.get(`/production/products/${productId}/recipe`).then((r) => r.data),

  addComponent: (
    productId: string,
    dto: { componentId: string; quantity: number; notes?: string },
  ): Promise<ProductComponent> =>
    apiClient.post(`/production/products/${productId}/recipe`, dto).then((r) => r.data),

  updateComponent: (
    productId: string,
    id: string,
    dto: { quantity?: number; notes?: string },
  ): Promise<ProductComponent> =>
    apiClient.patch(`/production/products/${productId}/recipe/${id}`, dto).then((r) => r.data),

  removeComponent: (productId: string, id: string): Promise<void> =>
    apiClient.delete(`/production/products/${productId}/recipe/${id}`).then(() => undefined),

  // ── Órdenes ───────────────────────────────────────────────────────────
  listOrders: (status?: ProductionOrderStatus): Promise<ProductionOrder[]> =>
    apiClient
      .get('/production/orders', { params: status ? { status } : undefined })
      .then((r) => r.data),

  getOrder: (id: string): Promise<ProductionOrder> =>
    apiClient.get(`/production/orders/${id}`).then((r) => r.data),

  createOrder: (dto: {
    productId: string;
    quantity: number;
    warehouseId?: string;
    notes?: string;
  }): Promise<ProductionOrder> =>
    apiClient.post('/production/orders', dto).then((r) => r.data),

  startOrder: (id: string): Promise<ProductionOrder> =>
    apiClient.post(`/production/orders/${id}/start`).then((r) => r.data),

  completeOrder: (
    id: string,
    dto: { consumptions?: { componentId: string; usedQuantity: number }[] } = {},
  ): Promise<ProductionOrder> =>
    apiClient.post(`/production/orders/${id}/complete`, dto).then((r) => r.data),

  cancelOrder: (id: string): Promise<ProductionOrder> =>
    apiClient.post(`/production/orders/${id}/cancel`).then((r) => r.data),
};
