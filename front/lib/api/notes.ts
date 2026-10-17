import { apiClient } from './client';

export type NotePriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type NoteView = 'all' | 'starred' | 'trash';

export interface UserNote {
  id: string;
  title: string;
  body: string;
  priority: NotePriority;
  starred: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface NoteInput {
  title: string;
  body: string;
  priority: NotePriority;
  starred: boolean;
}

export const notesApi = {
  list: (view: NoteView): Promise<UserNote[]> =>
    apiClient.get('/notes', { params: { view } }).then((r) => r.data),
  get: (id: string): Promise<UserNote> => apiClient.get(`/notes/${id}`).then((r) => r.data),
  create: (input: NoteInput): Promise<UserNote> => apiClient.post('/notes', input).then((r) => r.data),
  update: (id: string, input: Partial<NoteInput>): Promise<UserNote> =>
    apiClient.patch(`/notes/${id}`, input).then((r) => r.data),
  trash: (id: string): Promise<UserNote> => apiClient.post(`/notes/${id}/trash`).then((r) => r.data),
  restore: (id: string): Promise<UserNote> => apiClient.post(`/notes/${id}/restore`).then((r) => r.data),
  remove: (id: string): Promise<void> => apiClient.delete(`/notes/${id}`).then(() => undefined),
};
