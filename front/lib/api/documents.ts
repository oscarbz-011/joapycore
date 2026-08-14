import { apiClient } from './client';

export type DocType = 'INTERNAL' | 'CONTRACT' | 'COMPLIANCE';
export type DocVisibility = 'PUBLIC' | 'PRIVATE' | 'ROLE_BASED';

export interface Document {
  id: string;
  type: DocType;
  title: string;
  description?: string;
  category?: string;
  tags: string[];
  visibility: DocVisibility;
  allowedRoles: string[];
  fileUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  entityType?: string;
  entityId?: string;
  expiresAt?: string;
  content?: string;
  uploadedById?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentPayload {
  type: DocType;
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  visibility: DocVisibility;
  allowedRoles?: string[];
  fileUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  entityType?: string;
  entityId?: string;
  expiresAt?: string;
  content?: string;
}

export interface DocumentFilters {
  type?: DocType;
  category?: string;
  entityType?: string;
  entityId?: string;
  expiringSoonDays?: number;
  search?: string;
}

export const TYPE_LABELS: Record<DocType, string> = {
  INTERNAL: 'Interno',
  CONTRACT: 'Contrato',
  COMPLIANCE: 'Compliance',
};

export const VISIBILITY_LABELS: Record<DocVisibility, string> = {
  PUBLIC: 'Público',
  PRIVATE: 'Privado',
  ROLE_BASED: 'Por rol',
};

export const documentsApi = {
  list: (filters: DocumentFilters = {}): Promise<Document[]> =>
    apiClient.get('/documents', { params: filters }).then((r) => r.data),

  get: (id: string): Promise<Document> =>
    apiClient.get(`/documents/${id}`).then((r) => r.data),

  categories: (): Promise<string[]> =>
    apiClient.get('/documents/categories').then((r) => r.data),

  create: (payload: CreateDocumentPayload): Promise<Document> =>
    apiClient.post('/documents', payload).then((r) => r.data),

  update: (id: string, payload: Partial<CreateDocumentPayload>): Promise<Document> =>
    apiClient.patch(`/documents/${id}`, payload).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    apiClient.delete(`/documents/${id}`).then((r) => r.data),
};
