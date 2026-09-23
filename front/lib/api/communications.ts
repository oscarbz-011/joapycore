import { apiClient } from "./client";

export const COMMUNICATIONS_PATH = "/dashboard/applications/communications";
export type DeliveryStatus =
  | "QUEUED"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "UNKNOWN";
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
export interface CommunicationSettings {
  enabled: boolean;
  emailEnabled: boolean;
  invoiceEmailEnabled: boolean;
}
export interface CommunicationIdentity {
  id: string;
  type: "SYSTEM" | "SHARED";
  name?: string | null;
  fromEmail: string;
  fromName?: string | null;
  replyTo?: string | null;
  outboundEnabled: boolean;
  isDefault: boolean;
}
export type IdentityInput = Omit<CommunicationIdentity, "id">;
export interface CommunicationTemplate {
  id: string;
  code: string;
  version: number;
  subject: string;
  bodyText: string;
  createdAt: string;
}
export interface TemplateInput {
  subject: string;
  bodyText: string;
}
export interface DeliveryAttempt {
  id: string;
  attempt: number;
  status: string;
  errorMessage?: string | null;
  startedAt: string;
  finishedAt?: string | null;
}
export interface CommunicationMessage {
  id: string;
  recipient: string;
  subject: string;
  bodyText: string;
  status: DeliveryStatus;
  createdAt: string;
  sentAt?: string | null;
  entityType: string;
  entityId: string;
  lastError?: string | null;
  fromEmail?: string;
  replyTo?: string | null;
  deliveryAttempts?: DeliveryAttempt[];
}
export interface CommunicationNotification {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
  messageId: string | null;
  entityType?: string | null;
  entityId?: string | null;
}
export interface TimelineItem {
  id: string;
  kind: "MESSAGE" | "NOTE";
  createdAt: string;
  body?: string;
  bodyText?: string;
  subject?: string;
  status?: DeliveryStatus;
  recipient?: string;
  author?: { firstName: string; lastName: string } | null;
}

export const communicationsApi = {
  settings: (): Promise<CommunicationSettings> =>
    apiClient.get("/communications/settings").then((r) => r.data),
  updateSettings: (
    dto: CommunicationSettings,
  ): Promise<CommunicationSettings> =>
    apiClient.patch("/communications/settings", dto).then((r) => r.data),
  identities: (): Promise<CommunicationIdentity[]> =>
    apiClient.get("/communications/identities").then((r) => r.data),
  createIdentity: (dto: IdentityInput): Promise<CommunicationIdentity> =>
    apiClient.post("/communications/identities", dto).then((r) => r.data),
  updateIdentity: (
    id: string,
    dto: IdentityInput,
  ): Promise<CommunicationIdentity> =>
    apiClient
      .patch(`/communications/identities/${id}`, dto)
      .then((r) => r.data),
  templates: (): Promise<CommunicationTemplate[]> =>
    apiClient.get("/communications/templates").then((r) => r.data),
  createTemplate: (dto: TemplateInput): Promise<CommunicationTemplate> =>
    apiClient
      .post("/communications/templates/versions", dto)
      .then((r) => r.data),
  previewTemplate: (dto: TemplateInput): Promise<TemplateInput> =>
    apiClient
      .post("/communications/templates/preview", dto)
      .then((r) => r.data),
  messages: (
    page: number,
    status?: DeliveryStatus,
  ): Promise<Page<CommunicationMessage>> =>
    apiClient
      .get("/communications/messages", { params: { page, limit: 20, status } })
      .then((r) => r.data),
  message: (id: string): Promise<CommunicationMessage> =>
    apiClient.get(`/communications/messages/${id}`).then((r) => r.data),
  retryMessage: (id: string): Promise<CommunicationMessage> =>
    apiClient.post(`/communications/messages/${id}/retry`).then((r) => r.data),
  sendInvoice: (id: string): Promise<CommunicationMessage> =>
    apiClient.post(`/communications/invoices/${id}/send`).then((r) => r.data),
  timeline: (
    type: string,
    id: string,
    page: number,
  ): Promise<Page<TimelineItem>> =>
    apiClient
      .get(
        `/communications/timeline/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
        { params: { page, limit: 20 } },
      )
      .then((r) => r.data),
  addNote: (type: string, id: string, body: string): Promise<TimelineItem> =>
    apiClient
      .post(
        `/communications/timeline/${encodeURIComponent(type)}/${encodeURIComponent(id)}/notes`,
        { body },
      )
      .then((r) => r.data),
  notifications: (
    page: number,
  ): Promise<Page<CommunicationNotification> & { unreadCount: number }> =>
    apiClient
      .get("/communications/notifications", { params: { page, limit: 20 } })
      .then((r) => r.data),
  readNotification: (id: string): Promise<void> =>
    apiClient
      .post(`/communications/notifications/${id}/read`)
      .then(() => undefined),
};
