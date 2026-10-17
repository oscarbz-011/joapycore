import { Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { EmailConfig } from '../config/email.config';
import {
  PlatformDeliveryError,
  type PlatformOutgoingEmail,
} from './platform-delivery';

export function classifySmtpPlatformFailure(
  error: unknown,
  sending: boolean,
): PlatformDeliveryError {
  const code = (error as { responseCode?: unknown } | null)?.responseCode;
  if (typeof code !== 'number' || code < 400 || code > 599) {
    // Sin respuesta del servidor: si ya se estaba enviando, pudo haber salido.
    return new PlatformDeliveryError(
      'PROVIDER_UNREACHABLE',
      sending,
      true,
      sending
        ? 'No hubo respuesta del servidor de correo.'
        : 'No se pudo conectar con el servidor de correo.',
    );
  }
  if (code === 535 || code === 534 || code === 530) {
    return new PlatformDeliveryError(
      'PROVIDER_AUTH',
      false,
      false,
      'El servidor de correo rechazó las credenciales.',
    );
  }
  if (code < 500) {
    return new PlatformDeliveryError(
      'PROVIDER_LIMIT',
      false,
      true,
      'El servidor de correo no acepta envíos por ahora. Se reintentará más tarde.',
    );
  }
  return new PlatformDeliveryError(
    'PROVIDER_REJECTED',
    false,
    false,
    'El servidor de correo rechazó el envío.',
  );
}

/** El mismo envío reintentado lleva el mismo Message-ID. */
export function stableMessageId(key: string, fromAddress: string): string {
  const local = key.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 120);
  return `<${local}@${fromAddress.split('@')[1] ?? 'localhost'}>`;
}

/** Envío por el servidor SMTP del .env. Un solo intento. */
@Injectable()
export class SmtpPlatformClient {
  async send(
    config: EmailConfig,
    fromAddress: string,
    email: PlatformOutgoingEmail,
    idempotencyKey: string,
  ): Promise<{ id: string }> {
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
    const messageId = stableMessageId(idempotencyKey, fromAddress);
    let sending = false;
    try {
      await transporter.verify();
      sending = true;
      const result = await transporter.sendMail({
        messageId,
        from: email.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: email.replyTo,
        attachments: email.attachments,
      });
      const accepted = (result.accepted ?? []).map((value) =>
        String(value).toLowerCase(),
      );
      if (!accepted.includes(email.to.toLowerCase())) {
        throw new PlatformDeliveryError(
          'PROVIDER_REJECTED',
          false,
          false,
          'El servidor de correo no aceptó el destinatario.',
        );
      }
      return { id: result.messageId || messageId };
    } catch (error) {
      if (error instanceof PlatformDeliveryError) throw error;
      throw classifySmtpPlatformFailure(error, sending);
    } finally {
      transporter.close();
    }
  }
}
