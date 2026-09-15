import { apiClient, LONG_REQUEST_TIMEOUT_MS } from "./client";

export type AppEmailStatus = "SENDING" | "SENT" | "FAILED";

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

export const applicationsApi = {
  getEmailStatus: (): Promise<{ enabled: boolean }> =>
    apiClient
      .get("/applications/email/status")
      .then((response) => response.data),

  listEmailMessages: (): Promise<AppEmailMessage[]> =>
    apiClient
      .get("/applications/email/messages")
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
