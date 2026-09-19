import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { EmailConfig } from '../config/email.config';
import { IntegrationsService } from '../integrations/integrations.service';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendWithAttachmentInput {
  tenantId?: string;
  to: string;
  subject: string;
  html: string;
  attachment: EmailAttachment;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly integrationsService: IntegrationsService,
  ) {}

  private getTransporter(): Transporter {
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

  async sendWithAttachment(input: SendWithAttachmentInput): Promise<void> {
    const tenantConfig = input.tenantId
      ? await this.integrationsService.getEnabledSmtpConfig(input.tenantId)
      : null;
    if (tenantConfig) {
      const transporter = createTransport({
        host: tenantConfig.host,
        port: tenantConfig.port,
        secure: tenantConfig.secure,
        auth: tenantConfig.user
          ? { user: tenantConfig.user, pass: tenantConfig.password }
          : undefined,
      });
      try {
        await transporter.sendMail({
          from: tenantConfig.fromName
            ? { name: tenantConfig.fromName, address: tenantConfig.fromEmail }
            : tenantConfig.fromEmail,
          to: input.to,
          subject: input.subject,
          html: input.html,
          attachments: [input.attachment],
        });
      } finally {
        transporter.close();
      }
      return;
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

    await this.getTransporter().sendMail({
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
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user
        ? { user: config.user, pass: config.password }
        : undefined,
    });
    try {
      await transporter.sendMail({
        from: config.fromName
          ? { name: config.fromName, address: config.fromEmail }
          : config.fromEmail,
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
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
