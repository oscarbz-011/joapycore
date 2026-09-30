import { apiClient, LONG_REQUEST_TIMEOUT_MS } from "./client";

export type AppEmailStatus = "SENDING" | "UNKNOWN" | "SENT" | "FAILED";

export interface AppEmailMessage {
  id: string;
  recipient: string;
  subject: string;
  bodyText: string;
  status: AppEmailStatus;
  sentAt: string | null;
  createdAt: string;
  sentBy: { id: string; firstName: string; lastName: string };
}

export interface AppIncomingEmailMessage {
  id: string;
  mailbox: string;
  messageId: string | null;
  senderName: string | null;
  senderEmail: string;
  recipients: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  isRead: boolean;
  starred: boolean;
}

export interface ApplicationEmailStatus {
  /** Compatibilidad con la primera versión, que solo conocía SMTP. */
  enabled: boolean;
  /** Capacidades separadas para el cliente de correo completo. */
  outgoingEnabled?: boolean;
  incomingEnabled?: boolean;
  /** Buzón asignado al usuario autenticado por el administrador del tenant. */
  mailboxAddress?: string | null;
  /** Identidad reservada para notificaciones automáticas del sistema. */
  automaticSender?: string | null;
}

export const applicationsApi = {
  getEmailStatus: (): Promise<ApplicationEmailStatus> =>
    apiClient
      .get("/applications/email/status")
      .then((response) => response.data),

  listEmailMessages: (): Promise<AppEmailMessage[]> =>
    apiClient
      .get("/applications/email/messages")
      .then((response) => response.data),

  listEmailInbox: (): Promise<AppIncomingEmailMessage[]> =>
    apiClient
      .get("/applications/email/inbox")
      .then((response) => response.data),

  syncEmailInbox: (): Promise<{ synced: number; mailbox: string }> =>
    apiClient
      .post("/applications/email/sync", undefined, {
        timeout: LONG_REQUEST_TIMEOUT_MS,
      })
      .then((response) => response.data),

  sendEmail: (dto: {
    to: string;
    subject: string;
    body: string;
  }): Promise<AppEmailMessage> =>
    apiClient
      .post("/applications/email/messages", dto, {
        timeout: LONG_REQUEST_TIMEOUT_MS,
      })
      .then((response) => response.data),
};
