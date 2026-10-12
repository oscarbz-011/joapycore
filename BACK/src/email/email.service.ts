import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { EmailConfig } from '../config/email.config';
import { IntegrationsService } from '../integrations/integrations.service';
import { resolvePublicNetworkDestination } from '../integrations/network-destination.policy';
import { PlatformEmailService } from '../platform-email/platform-email.service';
import { ResendDeliveryError } from '../platform-email/resend.client';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendWithAttachmentInput {
  tenantId?: string;
  /** Para qué es: queda en el registro de envíos de la plataforma. */
  purpose?: string;
  to: string;
  subject: string;
  html: string;
  attachment: EmailAttachment;
}

export interface EmailDeliveryResult {
  to: string;
  messageId: string | null;
  accepted: string[];
  /** Dirección de la plataforma, cuando no salió por el correo de la empresa. */
  sentFrom?: string;
}

export class TenantSmtpDeliveryError extends Error {
  constructor(readonly ambiguous: boolean) {
    super(
      ambiguous
        ? 'El servidor SMTP no confirmó el resultado del envío'
        : 'El servidor SMTP rechazó el envío o no estaba disponible',
    );
  }
}

function tenantSmtpDeliveryError(error: unknown, sending: boolean) {
  const responseCode = (error as { responseCode?: unknown } | undefined)
    ?.responseCode;
  const explicitRejection =
    typeof responseCode === 'number' &&
    responseCode >= 400 &&
    responseCode <= 599;
  return new TenantSmtpDeliveryError(sending && !explicitRejection);
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly integrationsService: IntegrationsService,
    private readonly platformEmail: PlatformEmailService,
  ) {}

  private getTransporter(): Transporter<SMTPTransport.SentMessageInfo> {
    if (!this.transporter) {
      const config = this.configService.get<EmailConfig>('email')!;
      this.transporter = createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user
          ? { user: config.user, pass: config.password }
          : undefined,
      });
    }
    return this.transporter;
  }

  async sendWithAttachment(
    input: SendWithAttachmentInput,
  ): Promise<EmailDeliveryResult> {
    const tenantConfig = input.tenantId
      ? await this.integrationsService.getEnabledSmtpConfig(input.tenantId)
      : null;
    if (tenantConfig) {
      const destination = await resolvePublicNetworkDestination(
        tenantConfig.host,
      );
      const transporter = createTransport({
        host: destination.address,
        port: tenantConfig.port,
        secure: tenantConfig.secure,
        tls: destination.servername
          ? { servername: destination.servername }
          : undefined,
        auth: tenantConfig.user
          ? { user: tenantConfig.user, pass: tenantConfig.password }
          : undefined,
      });
      try {
        const info = await transporter.sendMail({
          from: tenantConfig.fromName
            ? { name: tenantConfig.fromName, address: tenantConfig.fromEmail }
            : tenantConfig.fromEmail,
          to: input.to,
          subject: input.subject,
          html: input.html,
          attachments: [input.attachment],
        });
        return this.deliveryResult(input.to, info);
      } finally {
        transporter.close();
      }
    }

    // La empresa todavía no conectó su correo: sale por el remitente de la
    // plataforma, identificada con su nombre y con las respuestas a su
    // dirección. Nunca por el SMTP global del .env, que no dice de quién es.
    if (input.tenantId) {
      if (!this.platformEmail.isConfigured()) {
        throw new ServiceUnavailableException(
          'El correo saliente de la empresa no está configurado o está desactivado',
        );
      }
      return this.viaPlatform(input.to, () =>
        this.platformEmail.sendForTenant({
          tenantId: input.tenantId!,
          purpose: input.purpose ?? 'document',
          to: input.to,
          subject: input.subject,
          html: input.html,
          attachment: input.attachment,
        }),
      );
    }

    // Un correo de JoapyCore mismo: por su remitente, si está configurado.
    if (this.platformEmail.isConfigured()) {
      return this.viaPlatform(input.to, () =>
        this.platformEmail.sendSystem({
          purpose: input.purpose ?? 'system',
          to: input.to,
          subject: input.subject,
          html: input.html,
          attachment: input.attachment,
        }),
      );
    }

    const config = this.configService.get<EmailConfig>('email')!;

    if (!config.host) {
      this.logger.warn(
        `SMTP no está configurado (SMTP_HOST vacío) — no se envió el email a ${input.to}`,
      );
      // 503 con el motivo: con un Error crudo el usuario veía un 500 genérico
      // sin saber que falta configurar el correo.
      throw new ServiceUnavailableException(
        'El servidor de correo no está configurado (SMTP_HOST)',
      );
    }

    const info = await this.getTransporter().sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: [
        {
          filename: input.attachment.filename,
          content: input.attachment.content,
          contentType: input.attachment.contentType,
        },
      ],
    });
    return this.deliveryResult(input.to, info);
  }

  private async viaPlatform(
    to: string,
    send: () => Promise<{ messageId: string; from: string }>,
  ): Promise<EmailDeliveryResult> {
    try {
      const sent = await send();
      return {
        to,
        messageId: sent.messageId,
        accepted: [to],
        sentFrom: sent.from,
      };
    } catch (error) {
      if (!(error instanceof ResendDeliveryError)) throw error;
      throw new ServiceUnavailableException(
        error.ambiguous
          ? 'No se pudo confirmar si el correo salió. Revisá antes de volver a enviarlo.'
          : error.message,
      );
    }
  }

  private deliveryResult(
    to: string,
    info: { messageId?: string; accepted?: unknown[]; rejected?: unknown[] },
  ): EmailDeliveryResult {
    const accepted = (info.accepted ?? []).map(String);
    const rejected = (info.rejected ?? []).map(String);
    if (accepted.length === 0 || rejected.includes(to)) {
      throw new ServiceUnavailableException(
        `El servidor SMTP no aceptó el destinatario ${to}`,
      );
    }
    return { to, messageId: info.messageId ?? null, accepted };
  }

  async sendTenantText(input: {
    tenantId: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    const config = await this.integrationsService.getEnabledSmtpConfig(
      input.tenantId,
    );
    if (!config) {
      throw new ServiceUnavailableException(
        'La integración de correo no está configurada o está desactivada',
      );
    }
    const destination = await resolvePublicNetworkDestination(config.host);
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
    });
    try {
      try {
        await transporter.verify();
      } catch (error) {
        throw tenantSmtpDeliveryError(error, false);
      }
      try {
        await transporter.sendMail({
          from: config.fromName
            ? { name: config.fromName, address: config.fromEmail }
            : config.fromEmail,
          to: input.to,
          subject: input.subject,
          text: input.text,
        });
      } catch (error) {
        throw tenantSmtpDeliveryError(error, true);
      }
    } finally {
      transporter.close();
    }
  }

  async isTenantEmailEnabled(tenantId: string): Promise<boolean> {
    return Boolean(
      await this.integrationsService.getEnabledSmtpConfig(tenantId),
    );
  }

  async getTenantEmailStatus(tenantId: string, mailboxAddress: string) {
    const integration =
      await this.integrationsService.getEmailIntegration(tenantId);
    const outgoingEnabled = integration.enabled && integration.configured;
    const incomingEnabled =
      integration.incoming.enabled && integration.incoming.configured;
    return {
      enabled: outgoingEnabled,
      outgoingEnabled,
      incomingEnabled,
      mailboxAddress,
      automaticSender: integration.fromEmail || null,
    };
  }
}
