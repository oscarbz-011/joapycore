import { apiClient } from './client';

export interface AuditUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string | null;
  module: string;
  action: string;
  resourceId: string | null;
  before: unknown | null;
  after: unknown | null;
  ipAddress: string | null;
  createdAt: string;
  user: AuditUser | null;
}

export interface AuditLogsResponse {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditFilters {
  module?: string;
  action?: string;
  userId?: string;
  resourceId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export const auditApi = {
  getLogs: (filters: AuditFilters = {}): Promise<AuditLogsResponse> => {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
    );
    return apiClient.get('/audit/logs', { params }).then((r) => r.data);
  },
};
