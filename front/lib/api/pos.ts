import { apiClient } from './client';
import type { SaleOrder } from './sales';

export type PosSessionStatus = 'OPEN' | 'CLOSED' | 'DISCREPANCY';

// Mirrors the Prisma PaymentMethod enum used by POST /pos/sales.
export type PosPaymentMethod = import('../payment-methods').PaymentMethod;

// /pos/sales and /pos/sales/history additionally include salePayments,
// which the generic SaleOrder type (sales.ts) doesn't declare.
export interface PosSaleOrder extends SaleOrder {
  salePayments: { id: string; amount: number; paymentMethod: PosPaymentMethod }[];
}

export interface PosTerminal {
  id: string;
  branchId: string;
  name: string;
  isActive: boolean;
  branch: { id: string; name: string };
}

export interface PosSession {
  id: string;
  terminalId: string;
  cashierId: string;
  status: PosSessionStatus;
  openingCash: number;
  closingCash: number | null;
  expectedCash: number | null;
  difference: number | null;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  terminal: { id: string; name: string; branchId: string };
  cashier: { id: string; firstName: string; lastName: string };
}

export interface CreatePosTerminalPayload {
  branchId: string;
  name: string;
}

export interface UpdatePosTerminalPayload {
  name?: string;
  isActive?: boolean;
}

export interface OpenPosSessionPayload {
  terminalId: string;
  openingCash: number;
}

export interface ClosePosSessionPayload {
  closingCash: number;
  notes?: string;
}

export interface CreatePosSaleItem {
  productId?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  // Depósito del que sale el ítem — obligatorio para ítems con producto.
  warehouseId?: string;
  serialNumbers?: string[];
}

export interface CreatePosSalePayment {
  amount: number;
  paymentMethod: PosPaymentMethod;
  reference?: string;
}

export interface CreatePosSalePayload {
  customerId?: string;
  items: CreatePosSaleItem[];
  payments: CreatePosSalePayment[];
}

export const posApi = {
  // Terminals
  listTerminals: (): Promise<PosTerminal[]> =>
    apiClient.get('/pos/terminals').then((r) => r.data),

  createTerminal: (dto: CreatePosTerminalPayload): Promise<PosTerminal> =>
    apiClient.post('/pos/terminals', dto).then((r) => r.data),

  updateTerminal: (id: string, dto: UpdatePosTerminalPayload): Promise<PosTerminal> =>
    apiClient.patch(`/pos/terminals/${id}`, dto).then((r) => r.data),

  // Sessions
  getActiveSession: (): Promise<PosSession | null> =>
    apiClient.get('/pos/sessions/active').then((r) => r.data),

  openSession: (dto: OpenPosSessionPayload): Promise<PosSession> =>
    apiClient.post('/pos/sessions', dto).then((r) => r.data),

  closeSession: (id: string, dto: ClosePosSessionPayload): Promise<PosSession> =>
    apiClient.post(`/pos/sessions/${id}/close`, dto).then((r) => r.data),

  listSessions: (filters: { terminalId?: string; status?: PosSessionStatus } = {}): Promise<PosSession[]> =>
    apiClient.get('/pos/sessions', { params: filters }).then((r) => r.data),

  // Sales
  createSale: (dto: CreatePosSalePayload): Promise<PosSaleOrder> =>
    apiClient.post('/pos/sales', dto).then((r) => r.data),

  listSessionSales: (sessionId: string): Promise<PosSaleOrder[]> =>
    apiClient.get('/pos/sales', { params: { sessionId } }).then((r) => r.data),

  listSalesHistory: (filters: { terminalId?: string; from?: string; to?: string } = {}): Promise<PosSaleOrder[]> =>
    apiClient.get('/pos/sales/history', { params: filters }).then((r) => r.data),
};
