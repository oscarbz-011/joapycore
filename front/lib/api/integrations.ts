import { apiClient } from "./client";

export type IntegrationStatus = "DISCONNECTED" | "CONNECTED" | "ERROR";

export interface EmailIntegration {
  enabled: boolean;
  configured: boolean;
  status: IntegrationStatus;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromEmail: string;
  fromName: string;
  hasPassword: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  incoming: IncomingEmailIntegration;
}

export interface IncomingEmailIntegration {
  enabled: boolean;
  configured: boolean;
  status: IntegrationStatus;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
}

export interface UpdateEmailIntegrationPayload {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromEmail: string;
  fromName?: string;
}

export interface UpdateIncomingEmailIntegrationPayload {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
}

export const integrationsApi = {
  getEmail: (): Promise<EmailIntegration> =>
    apiClient.get("/integrations/email").then((response) => response.data),

  updateEmail: (
    dto: UpdateEmailIntegrationPayload,
  ): Promise<EmailIntegration> =>
    apiClient.put("/integrations/email", dto).then((response) => response.data),

  testEmail: (): Promise<{ ok: true }> =>
    apiClient
      .post("/integrations/email/test")
      .then((response) => response.data),

  updateIncomingEmail: (
    dto: UpdateIncomingEmailIntegrationPayload,
  ): Promise<EmailIntegration> =>
    apiClient
      .put("/integrations/email/incoming", dto)
      .then((response) => response.data),

  testIncomingEmail: (): Promise<{ ok: true }> =>
    apiClient
      .post("/integrations/email/incoming/test")
      .then((response) => response.data),
};
