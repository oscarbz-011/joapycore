import { Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { IntegrationsService } from '../integrations/integrations.service';

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
  constructor(private readonly integrations: IntegrationsService) {}

  async send(input: TransactionalEmail): Promise<{ messageId: string }> {
    const config = await this.integrations.getEnabledSmtpConfig(input.tenantId);
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
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
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
}
