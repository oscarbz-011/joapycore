import { apiClient } from './client';
import type { BillingModality } from './billing';
import type { SaleOrder } from './sales';

export type PosSessionStatus = 'OPEN' | 'CLOSED' | 'DISCREPANCY';

// Mirrors the Prisma PaymentMethod enum used by POST /pos/sales.
export type PosPaymentMethod = import('../payment-methods').PaymentMethod;

// /pos/sales and /pos/sales/history additionally include salePayments,
// which the generic SaleOrder type (sales.ts) doesn't declare.
export interface PosSaleOrder extends SaleOrder {
  salePayments: { id: string; amount: number; paymentMethod: PosPaymentMethod }[];
}

export type PosPrintFormat = 'THERMAL_58' | 'THERMAL_80' | 'A4' | 'HALF_LETTER';

export interface PosTerminal {
  id: string;
  branchId: string;
  name: string;
  isActive: boolean;
  invoiceSeriesId: string | null;
  printFormat: PosPrintFormat;
  thermalPaperReportFileId: string | null;
  thermalPaperConservation: string | null;
  branch: { id: string; name: string };
  thermalPaperReport: { id: string; originalName: string } | null;
}

/** Serie de facturas de la caja; `problem` dice por qué no puede numerar hoy. */
export interface PosInvoiceSeries {
  id: string;
  branchId: string;
  modality: BillingModality;
  establecimiento: string;
  puntoExpedicion: string;
  timbrado: string | null;
  rangeFrom: number;
  rangeTo: number;
  nextNumber: number;
  isInvoiceSeries: boolean;
  problem: string | null;
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
  terminal: {
    id: string;
    name: string;
    branchId: string;
    invoiceSeriesId: string | null;
    printFormat: PosPrintFormat;
    thermalPaperConservation: string | null;
  };
  cashier: { id: string; firstName: string; lastName: string };
}

/** La sesión abierta del cajero, con la serie con la que factura su caja. */
export interface ActivePosSession extends PosSession {
  invoiceSeries: PosInvoiceSeries | null;
}

export interface CreatePosTerminalPayload {
  branchId: string;
  name: string;
}

export interface UpdatePosTerminalPayload {
  name?: string;
  isActive?: boolean;
  invoiceSeriesId?: string | null;
  printFormat?: PosPrintFormat;
  thermalPaperReportFileId?: string | null;
  thermalPaperConservation?: string | null;
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
  /** Número de la hoja del talonario, si la caja factura con talonario. */
  documentNumber?: number;
}

/** Lo que se imprime de la factura de una venta de caja. */
export interface PosReceipt {
  invoiceId: string;
  modality: BillingModality | null;
  number: string;
  timbrado: string | null;
  timbradoValidFrom: string | null;
  timbradoValidUntil: string | null;
  issuedAt: string | null;
  condition: 'CONTADO' | 'CRÉDITO';
  issuer: {
    name: string;
    fantasyName: string | null;
    ruc: string | null;
    address: string | null;
    city: string | null;
    phone: string | null;
    activity: string | null;
    branchName: string | null;
    branchAddress: string | null;
  };
  buyer: { name: string; document: string };
  lines: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    ivaRate: number;
  }[];
  totals: {
    exempt: number;
    taxed5: number;
    taxed10: number;
    iva5: number;
    iva10: number;
    ivaTotal: number;
    total: number;
  };
  copy: boolean;
  terminalName: string;
  cashierName: string;
  printFormat: PosPrintFormat;
  paperConservation: string | null;
  payments: { paymentMethod: PosPaymentMethod; amount: number }[];
  change: number;
}

export interface PosSaleResult {
  saleOrderId: string;
  receipt: PosReceipt;
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
  getActiveSession: (): Promise<ActivePosSession | null> =>
    apiClient.get('/pos/sessions/active').then((r) => r.data),

  openSession: (dto: OpenPosSessionPayload): Promise<PosSession> =>
    apiClient.post('/pos/sessions', dto).then((r) => r.data),

  closeSession: (id: string, dto: ClosePosSessionPayload): Promise<PosSession> =>
    apiClient.post(`/pos/sessions/${id}/close`, dto).then((r) => r.data),

  listSessions: (filters: { terminalId?: string; status?: PosSessionStatus } = {}): Promise<PosSession[]> =>
    apiClient.get('/pos/sessions', { params: filters }).then((r) => r.data),

  // Sales
  createSale: (dto: CreatePosSalePayload): Promise<PosSaleResult> =>
    apiClient.post('/pos/sales', dto).then((r) => r.data),

  /** `copy`: reimpresión, sale marcada como COPIA. */
  getReceipt: (saleOrderId: string, copy = false): Promise<PosReceipt> =>
    apiClient
      .get(`/pos/sales/${saleOrderId}/receipt`, { params: copy ? { copy: true } : {} })
      .then((r) => r.data),

  listSessionSales: (sessionId: string): Promise<PosSaleOrder[]> =>
    apiClient.get('/pos/sales', { params: { sessionId } }).then((r) => r.data),

  listSalesHistory: (filters: { terminalId?: string; from?: string; to?: string } = {}): Promise<PosSaleOrder[]> =>
    apiClient.get('/pos/sales/history', { params: filters }).then((r) => r.data),
};
