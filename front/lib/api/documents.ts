import { apiClient, LONG_REQUEST_TIMEOUT_MS } from './client';

export type DocType = 'INTERNAL' | 'CONTRACT' | 'COMPLIANCE' | 'BILLING';
export type DocVisibility = 'PUBLIC' | 'PRIVATE' | 'ROLE_BASED';
export type TemplateKind = 'SALE_CONTRACT' | 'INVOICE' | 'PAYMENT_RECEIPT';
export type DocContentFormat = 'TIPTAP' | 'HTML' | 'DOCX';

export interface DocumentCategory {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface FileRecord {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Document {
  id: string;
  type: DocType;
  title: string;
  description?: string;
  categoryId?: string | null;
  category?: DocumentCategory | null;
  tags: string[];
  visibility: DocVisibility;
  allowedRoles: string[];
  fileRecordId?: string | null;
  fileRecord?: FileRecord | null;
  entityType?: string;
  entityId?: string;
  expiresAt?: string;
  content?: string;
  contentFormat: DocContentFormat;
  isTemplate: boolean;
  templateKind?: TemplateKind | null;
  variables?: TemplateVariable[] | null;
  uploadedById?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentPayload {
  type: DocType;
  title: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  visibility: DocVisibility;
  allowedRoles?: string[];
  entityType?: string;
  entityId?: string;
  expiresAt?: string;
  content?: string;
  contentFormat?: DocContentFormat;
  isTemplate?: boolean;
  templateKind?: TemplateKind;
  // Si ya hay otra plantilla activa para el templateKind elegido, desactivarla
  // (le quita el uso automático) en vez de que el backend rechace con 409.
  replaceActiveTemplate?: boolean;
}

export interface DocumentFilters {
  type?: DocType;
  categoryId?: string;
  isTemplate?: boolean;
  templateKind?: TemplateKind;
  entityType?: string;
  entityId?: string;
  expiringSoonDays?: number;
  search?: string;
}

export const TYPE_LABELS: Record<DocType, string> = {
  INTERNAL: 'Interno',
  CONTRACT: 'Contrato',
  COMPLIANCE: 'Compliance',
  BILLING: 'Facturación',
};

export const VISIBILITY_LABELS: Record<DocVisibility, string> = {
  PUBLIC: 'Público',
  PRIVATE: 'Privado',
  ROLE_BASED: 'Por rol',
};

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  SALE_CONTRACT: 'Contrato de compra-venta',
  INVOICE: 'Factura',
  PAYMENT_RECEIPT: 'Recibo de dinero',
};

// Tipo de documento sugerido al elegir cada templateKind — el usuario puede
// cambiarlo igual, es solo un valor inicial razonable.
export const TEMPLATE_KIND_DEFAULT_DOC_TYPE: Record<TemplateKind, DocType> = {
  SALE_CONTRACT: 'CONTRACT',
  INVOICE: 'BILLING',
  PAYMENT_RECEIPT: 'BILLING',
};

// Factura/Recibo necesitan control de layout fino (columnas, encabezado
// bicolumna con borde) que el editor WYSIWYG de TipTap no puede dar — se
// editan como HTML/CSS crudo. El contrato de venta sigue en TipTap.
export const TEMPLATE_KIND_DEFAULT_CONTENT_FORMAT: Record<TemplateKind, DocContentFormat> = {
  SALE_CONTRACT: 'TIPTAP',
  INVOICE: 'HTML',
  PAYMENT_RECEIPT: 'HTML',
};

export const CONTENT_FORMAT_LABELS: Record<DocContentFormat, string> = {
  TIPTAP: 'Editor de texto enriquecido',
  HTML: 'HTML/CSS crudo',
  DOCX: 'Archivo Word (.docx)',
};

export const documentsApi = {
  list: (filters: DocumentFilters = {}): Promise<Document[]> =>
    apiClient.get('/documents', { params: filters }).then((r) => r.data),

  get: (id: string): Promise<Document> =>
    apiClient.get(`/documents/${id}`).then((r) => r.data),

  create: (payload: CreateDocumentPayload): Promise<Document> =>
    apiClient.post('/documents', payload).then((r) => r.data),

  update: (id: string, payload: Partial<CreateDocumentPayload>): Promise<Document> =>
    apiClient.patch(`/documents/${id}`, payload).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    apiClient.delete(`/documents/${id}`).then((r) => r.data),

  uploadFile: (id: string, file: File): Promise<Document> => {
    const form = new FormData();
    form.append('file', file);
    return apiClient
      .post(`/documents/${id}/file`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: LONG_REQUEST_TIMEOUT_MS,
      })
      .then((r) => r.data);
  },

  removeFile: (id: string): Promise<Document> =>
    apiClient.delete(`/documents/${id}/file`).then((r) => r.data),

  templateKinds: (): Promise<{ key: TemplateKind; label: string; variables: TemplateVariable[] }[]> =>
    apiClient.get('/documents/template-kinds').then((r) => r.data),

  sendEmail: (id: string, to?: string): Promise<void> =>
    apiClient
      .post(`/documents/${id}/email`, { to }, { timeout: LONG_REQUEST_TIMEOUT_MS })
      .then((r) => r.data),

  generate: (id: string, values: Record<string, string>): Promise<{ fileId: string }> =>
    apiClient
      .post(`/documents/${id}/generate`, { values }, { timeout: LONG_REQUEST_TIMEOUT_MS })
      .then((r) => r.data),
};

export interface TemplateVariable {
  key: string;
  label: string;
  type: 'text' | 'table';
  columns?: string[];
}

const VARIABLE_TOKEN_RE = /\{\{([\w.]+)\}\}/g;

// Extrae las claves {{clave}} únicas presentes en el contenido TipTap (string
// JSON), en el orden en que aparecen — variables libres, no la lista fija de
// TEMPLATE_KIND_DEFS del backend.
export function extractVariableKeys(contentJson?: string): string[] {
  if (!contentJson) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of contentJson.matchAll(VARIABLE_TOKEN_RE)) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      keys.push(match[1]);
    }
  }
  return keys;
}

// Usado para el badge "N variables" en las tarjetas.
export function countTemplateVariables(contentJson?: string): number {
  return extractVariableKeys(contentJson).length;
}

export const documentCategoriesApi = {
  list: (): Promise<DocumentCategory[]> =>
    apiClient.get('/documents/categories').then((r) => r.data),

  create: (name: string): Promise<DocumentCategory> =>
    apiClient.post('/documents/categories', { name }).then((r) => r.data),

  update: (id: string, name: string): Promise<DocumentCategory> =>
    apiClient.patch(`/documents/categories/${id}`, { name }).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    apiClient.delete(`/documents/categories/${id}`).then((r) => r.data),
};
