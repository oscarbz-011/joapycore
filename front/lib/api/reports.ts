import { apiClient } from './client';

export interface SalesReportSummary {
  totalRevenue: number;
  ordersCount: number;
  avgOrderValue: number;
  invoicedCount: number;
  confirmedCount: number;
}

export interface SalesReport {
  summary: SalesReportSummary;
  byMonth: { month: string; revenue: number; orders: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
}

export interface StockItem {
  id: string;
  name: string;
  model: string | null;
  category: string;
  brand: string;
  isSerialized: boolean;
  stock: number;
  costPrice: number;
  salePrice: number;
  stockValue: number;
  isActive: boolean;
}

export interface StockReport {
  summary: { totalProducts: number; totalStockValue: number; lowStock: number; outOfStock: number };
  products: StockItem[];
}

export interface ARItem {
  id: string;
  customer: string;
  amount: number;
  paidAmount: number;
  pending: number;
  status: string;
  dueDate: string | null;
  isOverdue: boolean;
}

export interface ReceivablesReport {
  summary: { totalPending: number; totalOverdue: number; totalCollected: number; totalItems: number };
  items: ARItem[];
}

export const reportsApi = {
  getSales: (dateFrom?: string, dateTo?: string): Promise<SalesReport> => {
    const params: Record<string, string> = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    return apiClient.get('/reports/sales', { params }).then((r) => r.data);
  },

  getStock: (): Promise<StockReport> =>
    apiClient.get('/reports/stock').then((r) => r.data),

  getReceivables: (): Promise<ReceivablesReport> =>
    apiClient.get('/reports/receivables').then((r) => r.data),
};
