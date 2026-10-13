import { apiClient } from "./client";

export const COMMUNICATIONS_PATH = "/dashboard/communications";
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
  contact?: { type: string; id: string } | null;
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

export type ContactType = "CUSTOMER";
export interface ConversationContact {
  type: ContactType;
  id: string;
  code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
}
export interface Conversation {
  contact: ConversationContact;
  messages: number;
  notes: number;
  problems: number;
  lastAt: string;
  lastMessage: {
    id: string;
    subject: string;
    status: DeliveryStatus;
    createdAt: string;
  } | null;
}
export interface ConversationsFilter {
  page: number;
  onlyProblems?: boolean;
  search?: string;
}
export interface ConversationsSummary {
  problemConversations: number;
  problemMessages: number;
}
export interface ThreadMessage {
  kind: "MESSAGE";
  id: string;
  entityType: string;
  entityId: string;
  recipient: string;
  subject: string;
  bodyText: string;
  fromEmail: string;
  fromName: string | null;
  status: DeliveryStatus;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
}
export interface ThreadNote {
  kind: "NOTE";
  id: string;
  entityType: string;
  entityId: string;
  body: string;
  createdAt: string;
  author: { firstName: string; lastName: string } | null;
}
export type ThreadItem = ThreadMessage | ThreadNote;
export interface Thread extends Page<ThreadItem> {
  contact: ConversationContact;
}

const conversationPath = (contact: Pick<ConversationContact, "type" | "id">) =>
  `/communications/conversations/${contact.type}/${encodeURIComponent(contact.id)}`;

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
  conversations: (filter: ConversationsFilter): Promise<Page<Conversation>> =>
    apiClient
      .get("/communications/conversations", {
        params: {
          page: filter.page,
          limit: 20,
          onlyProblems: filter.onlyProblems || undefined,
          search: filter.search || undefined,
        },
      })
      .then((r) => r.data),
  conversationsSummary: (): Promise<ConversationsSummary> =>
    apiClient.get("/communications/conversations/summary").then((r) => r.data),
  thread: (
    contact: Pick<ConversationContact, "type" | "id">,
    page: number,
  ): Promise<Thread> =>
    apiClient
      .get(conversationPath(contact), { params: { page, limit: 20 } })
      .then((r) => r.data),
  addConversationNote: (
    contact: Pick<ConversationContact, "type" | "id">,
    body: string,
  ): Promise<ThreadNote> =>
    apiClient
      .post(`${conversationPath(contact)}/notes`, { body })
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
