import { apiClient } from './client';
import type {
  AttachedFile,
  BillingEvent,
  BillingModality,
  BillingSeriesOption,
} from './billing';

export type RemissionMotive =
  | 'SALE'
  | 'CONSIGNMENT'
  | 'EXPORT'
  | 'PURCHASE'
  | 'IMPORT'
  | 'RETURN'
  | 'BRANCH_TRANSFER'
  | 'TRANSFORMATION'
  | 'REPAIR'
  | 'MOBILE_ISSUER'
  | 'EXHIBITION'
  | 'TRADE_FAIR'
  | 'OTHER';
export type RemissionNoteStatus = 'ISSUED' | 'VOIDED';
export type TransportType = 'OWN' | 'THIRD_PARTY';

interface WarehouseRef {
  id: string;
  name: string;
  branch: { id: string; name: string } | null;
}

export interface RemissionNote {
  id: string;
  number: string;
  numberPrefix: string;
  motive: RemissionMotive;
  status: RemissionNoteStatus;
  modality: BillingModality;
  issuedAt: string;
  recipientName: string;
  transportStartDate: string;
  transportEndDate: string;
  createdAt: string;
  branch: { id: string; name: string };
  invoice: { id: string; invoicePrefix: string | null; invoiceNumber: string | null } | null;
  fromWarehouse: WarehouseRef | null;
  toWarehouse: WarehouseRef | null;
  _count: { items: number };
}

export interface RemissionNoteItem {
  id: string;
  productId: string | null;
  invoiceItemId: string | null;
  description: string;
  unit: string;
  quantity: number;
  serialNumbers: string[];
}

export interface RemissionNoteDetail extends RemissionNote {
  motiveDetail: string | null;
  customerId: string | null;
  recipientDocument: string;
  originAddress: string;
  originCity: string | null;
  originDepartment: string | null;
  destinationAddress: string;
  destinationCity: string | null;
  destinationDepartment: string | null;
  transportType: TransportType;
  vehicleBrand: string;
  vehiclePlate: string;
  trailerPlate: string | null;
  carrierName: string;
  carrierRuc: string;
  carrierAddress: string;
  driverName: string;
  driverDocument: string;
  driverAddress: string;
  notes: string | null;
  timbrado: string;
  timbradoValidFrom: string | null;
  timbradoValidUntil: string | null;
  sequential: number;
  issuedById: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  pdfFileId: string | null;
  physicalScan: AttachedFile | null;
  items: RemissionNoteItem[];
  events: BillingEvent[];
}

export interface RemissionPlace {
  address: string;
  city: string;
  department: string;
}

export interface RemissionCompany {
  name: string;
  ruc: string;
  address: string;
}

export interface TransferOptions {
  company: RemissionCompany;
  warehouses: (WarehouseRef & { place: RemissionPlace })[];
  series: BillingSeriesOption[];
}

export interface TransferStockRow {
  productId: string;
  description: string;
  unit: string;
  isSerialized: boolean;
  quantity: number;
  serialNumbers: string[];
}

export interface RemitableItem {
  invoiceItemId: string;
  productId: string;
  description: string;
  unit: string;
  quantity: number;
  remitted: number;
  remitable: number;
  isSerialized: boolean;
  soldSerials: string[];
}

export interface SaleRemissionOptions {
  invoice: { id: string; number: string; issuedAt: string | null; anonymousBuyer: boolean };
  recipient: { name: string; document: string };
  origin: RemissionPlace;
  destination: RemissionPlace;
  company: RemissionCompany;
  items: RemitableItem[];
  series: BillingSeriesOption[];
}

export interface RemissionTransportPayload {
  type: TransportType;
  vehicleBrand: string;
  vehiclePlate: string;
  trailerPlate?: string;
  carrierName: string;
  carrierRuc: string;
  carrierAddress: string;
  driverName: string;
  driverDocument: string;
  driverAddress: string;
  startDate: string;
  endDate: string;
}

interface RemissionIssuePayload {
  origin: RemissionPlace;
  destination: RemissionPlace;
  transport: RemissionTransportPayload;
  seriesId?: string;
  documentNumber?: number;
  notes?: string;
}

export interface IssueTransferPayload extends RemissionIssuePayload {
  fromWarehouseId: string;
  toWarehouseId: string;
  items: { productId: string; quantity: number; serialNumbers?: string[] }[];
}

export interface IssueSaleRemissionPayload extends RemissionIssuePayload {
  recipientName: string;
  recipientDocument: string;
  items: { invoiceItemId: string; quantity: number; serialNumbers?: string[] }[];
}

export const remissionNotesApi = {
  list: (): Promise<RemissionNote[]> =>
    apiClient.get('/billing/remission-notes').then((r) => r.data),

  get: (id: string): Promise<RemissionNoteDetail> =>
    apiClient.get(`/billing/remission-notes/${id}`).then((r) => r.data),

  listByInvoice: (invoiceId: string): Promise<RemissionNote[]> =>
    apiClient.get(`/billing/invoices/${invoiceId}/remission-notes`).then((r) => r.data),

  transferOptions: (): Promise<TransferOptions> =>
    apiClient.get('/billing/remission-notes/transfer-options').then((r) => r.data),

  transferStock: (warehouseId: string): Promise<TransferStockRow[]> =>
    apiClient
      .get('/billing/remission-notes/transfer-stock', { params: { warehouseId } })
      .then((r) => r.data),

  issueTransfer: (dto: IssueTransferPayload): Promise<RemissionNoteDetail> =>
    apiClient.post('/billing/remission-notes/transfer', dto).then((r) => r.data),

  saleOptions: (invoiceId: string): Promise<SaleRemissionOptions> =>
    apiClient.get(`/billing/invoices/${invoiceId}/remission-options`).then((r) => r.data),

  issueForSale: (invoiceId: string, dto: IssueSaleRemissionPayload): Promise<RemissionNoteDetail> =>
    apiClient.post(`/billing/invoices/${invoiceId}/remission-notes`, dto).then((r) => r.data),

  void: (id: string, reason: string): Promise<RemissionNoteDetail> =>
    apiClient.post(`/billing/remission-notes/${id}/void`, { reason }).then((r) => r.data),

  retryPdf: (id: string): Promise<RemissionNoteDetail> =>
    apiClient.post(`/billing/remission-notes/${id}/pdf/retry`).then((r) => r.data),

  setPhysicalScan: (id: string, fileId: string | null): Promise<RemissionNoteDetail> =>
    apiClient.post(`/billing/remission-notes/${id}/physical-scan`, { fileId }).then((r) => r.data),
};
