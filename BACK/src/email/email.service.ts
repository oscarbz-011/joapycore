import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { EmailConfig } from '../config/email.config';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendWithAttachmentInput {
  to: string;
  subject: string;
  html: string;
  attachment: EmailAttachment;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

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
}
