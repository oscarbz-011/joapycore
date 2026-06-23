import { apiClient } from './client';

export interface FileRecord {
  id: string;
  tenantId: string;
  module: string;
  entityType: string;
  entityId: string | null;
  bucket: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  url: string | null;
  createdAt: string;
}

export const filesApi = {
  upload: (
    file: File,
    meta: { module: string; entityType: string; entityId?: string },
  ): Promise<FileRecord> => {
    const form = new FormData();
    form.append('file', file);
    const params = new URLSearchParams({
      module: meta.module,
      entityType: meta.entityType,
      ...(meta.entityId ? { entityId: meta.entityId } : {}),
    });
    return apiClient
      .post(`/files/upload?${params.toString()}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  getById: (id: string): Promise<FileRecord> =>
    apiClient.get(`/files/${id}`).then((r) => r.data),

  getByEntity: (entityType: string, entityId: string): Promise<FileRecord[]> =>
    apiClient.get(`/files`, { params: { entityType, entityId } }).then((r) => r.data),

  downloadUrl: (id: string): string =>
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/files/${id}/download`,

  delete: (id: string): Promise<void> =>
    apiClient.delete(`/files/${id}`).then((r) => r.data),
};
