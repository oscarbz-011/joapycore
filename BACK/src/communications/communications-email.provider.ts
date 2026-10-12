import { Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { IntegrationsService } from '../integrations/integrations.service';
import { resolvePublicNetworkDestination } from '../integrations/network-destination.policy';
import {
  PlatformEmailLimitError,
  PlatformEmailService,
} from '../platform-email/platform-email.service';
import { ResendDeliveryError } from '../platform-email/resend.client';

export interface TransactionalEmail {
  tenantId: string;
  messageId: string;
  recipient: string;
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
  subject: string;
  bodyText: string;
  attachment: { filename: string; content: Buffer; contentType: string };
}

export class CommunicationDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly ambiguous: boolean,
    message: string,
  ) {
    super(message);
  }
}

export function classifySmtpFailure(
  error: unknown,
  sending: boolean,
): CommunicationDeliveryError {
  const smtp = error as { responseCode?: number; code?: string } | undefined;
  const rejected =
    typeof smtp?.responseCode === 'number' &&
    smtp.responseCode >= 400 &&
    smtp.responseCode <= 599;
  if (sending && !rejected) {
    return new CommunicationDeliveryError(
      'SMTP_OUTCOME_UNKNOWN',
      true,
      'El servidor no confirmó el resultado. Revisá el proveedor antes de realizar otro envío.',
    );
  }
  return new CommunicationDeliveryError(
    rejected ? 'SMTP_REJECTED' : 'SMTP_UNAVAILABLE',
    false,
    rejected
      ? `El servidor SMTP rechazó el envío (código ${smtp.responseCode}).`
      : 'No se pudo establecer o autenticar la conexión SMTP.',
  );
}

/** The encrypted, tenant-specific SMTP integration is the first provider bridge. */
@Injectable()
export class CommunicationsEmailProvider {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly platformEmail: PlatformEmailService,
  ) {}

  async send(input: TransactionalEmail): Promise<{ messageId: string }> {
    const config = await this.integrations.getEnabledSmtpConfig(input.tenantId);
    // Sin correo propio conectado, la factura sale por el remitente de la
    // plataforma; las respuestas van a la dirección de la identidad.
    if (!config && this.platformEmail.isConfigured()) {
      return this.sendViaPlatform(input);
    }
    if (!config) {
      throw new CommunicationDeliveryError(
        'SMTP_NOT_CONFIGURED',
        false,
        'El SMTP del tenant está desactivado o sin configurar.',
      );
    }
    if (
      config.fromEmail.trim().toLowerCase() !==
      input.fromEmail.trim().toLowerCase()
    ) {
      throw new CommunicationDeliveryError(
        'SENDER_CHANGED',
        false,
        'El remitente configurado ya no coincide con la identidad del mensaje.',
      );
    }
    let destination: Awaited<
      ReturnType<typeof resolvePublicNetworkDestination>
    >;
    try {
      destination = await resolvePublicNetworkDestination(config.host);
    } catch (error) {
      throw classifySmtpFailure(error, false);
    }
    const transporter = createTransport({
      host: destination.address,
      port: config.port,
      secure: config.secure,
      tls: destination.servername
        ? { servername: destination.servername }
        : undefined,
      auth: config.user
        ? { user: config.user, pass: config.password }
        : undefined,
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 90_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    let sending = false;
    try {
      // Failure before DATA is known not to have sent a message.
      await transporter.verify();
      sending = true;
      const result = await transporter.sendMail({
        messageId: input.messageId,
        from: input.fromName
          ? { name: input.fromName, address: input.fromEmail }
          : input.fromEmail,
        replyTo: input.replyTo ?? undefined,
        to: input.recipient,
        subject: input.subject,
        text: input.bodyText,
        attachments: [input.attachment],
      });
      const accepted = (result.accepted ?? [])
        .map(String)
        .map((value) => value.toLowerCase());
      if (!accepted.includes(input.recipient.toLowerCase())) {
        throw new CommunicationDeliveryError(
          'RECIPIENT_REJECTED',
          false,
          'El servidor SMTP no aceptó el destinatario.',
        );
      }
      // SMTP acceptance means SENT, never delivered/read.
      return { messageId: result.messageId || input.messageId };
    } catch (error) {
      if (error instanceof CommunicationDeliveryError) throw error;
      throw classifySmtpFailure(error, sending);
    } finally {
      transporter.close();
    }
  }

  private async sendViaPlatform(
    input: TransactionalEmail,
  ): Promise<{ messageId: string }> {
    try {
      const sent = await this.platformEmail.sendForTenant({
        tenantId: input.tenantId,
        purpose: 'invoice',
        to: input.recipient,
        subject: input.subject,
        text: input.bodyText,
        attachment: input.attachment,
        replyTo: input.replyTo ?? input.fromEmail,
        // El mismo mensaje reintentado no sale dos veces.
        idempotencyKey: `communication-${input.messageId}`,
      });
      return { messageId: sent.messageId };
    } catch (error) {
      if (error instanceof ResendDeliveryError) {
        throw new CommunicationDeliveryError(
          error.code,
          error.ambiguous,
          error.message,
        );
      }
      if (error instanceof PlatformEmailLimitError) {
        throw new CommunicationDeliveryError(
          'PLATFORM_DAILY_LIMIT',
          false,
          error.message,
        );
      }
      throw error;
    }
  }
}
