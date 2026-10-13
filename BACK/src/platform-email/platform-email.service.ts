import { randomUUID } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailConfig } from '../config/email.config';
import type { PlatformEmailConfig } from '../config/platform-email.config';
import { PlatformEmailRepository } from './platform-email.repository';
import {
  addressOf,
  remainingToday,
  replyAddress,
  resendTag,
  sharedSender,
  systemSender,
  tenantSender,
  tenantSenderName,
} from './platform-email.util';
import {
  PlatformDeliveryError,
  type PlatformOutgoingEmail,
} from './platform-delivery';
import { ResendClient } from './resend.client';
import { SmtpPlatformClient } from './smtp-platform.client';

export interface PlatformAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface Content {
  /** Para qué es el correo: "purchase.order", "invoice", "system.password_reset"… */
  purpose: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  attachment?: PlatformAttachment;
  /** El mismo valor en un reintento evita que el correo salga dos veces. */
  idempotencyKey?: string;
}

export interface TenantPlatformEmail extends Content {
  tenantId: string;
  /** A dónde responde el destinatario; por defecto, el correo de la empresa. */
  replyTo?: string | null;
}

export interface PlatformEmailResult {
  messageId: string;
  /** La dirección desde la que salió. */
  from: string;
}

type Sender = { address: string; name: string; header: string };

/** Por dónde sale y con qué remitente, según el .env. */
interface Route {
  tenantSender(tenantName: string): Sender;
  systemSender(): Sender;
  send(
    email: PlatformOutgoingEmail,
    idempotencyKey: string,
  ): Promise<{ id: string }>;
}

/** La empresa agotó lo que puede mandar por el remitente compartido. */
export class PlatformEmailLimitError extends HttpException {
  constructor(readonly dailyLimit: number) {
    super(
      `Esta empresa ya envió ${dailyLimit} correos en las últimas 24 horas por el remitente de la plataforma. Conectá el correo de la empresa para enviar sin ese tope.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * El remitente de la plataforma: los correos propios de JoapyCore y los de las
 * empresas que todavía no conectaron su correo.
 *
 * Todas las empresas comparten el remitente, y con él la reputación: por eso
 * cada una tiene un tope diario y sale identificada con su nombre.
 */
@Injectable()
export class PlatformEmailService {
  private readonly logger = new Logger(PlatformEmailService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly repository: PlatformEmailRepository,
    private readonly resend: ResendClient,
    private readonly smtp: SmtpPlatformClient,
  ) {}

  private get config(): PlatformEmailConfig {
    return this.configService.get<PlatformEmailConfig>('platformEmail')!;
  }

  isConfigured(): boolean {
    return this.route() !== null;
  }

  private route(): Route | null {
    const config = this.config;
    if (config.driver === 'smtp') {
      const smtp = this.configService.get<EmailConfig>('email');
      const address = addressOf(smtp?.from);
      if (!smtp?.host || !address) return null;
      // Un servidor SMTP solo deja enviar desde su propia dirección: lo que
      // distingue a cada empresa es el nombre y a quién se le responde.
      return {
        tenantSender: (name) =>
          sharedSender(address, tenantSenderName(name, config.brand)),
        systemSender: () => sharedSender(address, config.brand),
        send: (email, key) => this.smtp.send(smtp, address, email, key),
      };
    }
    const { apiKey, domain } = config;
    if (!apiKey || !domain) return null;
    return {
      tenantSender: (name) => tenantSender(name, config.brand, domain),
      systemSender: () =>
        systemSender(config.brand, config.systemLocalPart, domain),
      send: (email, key) => this.resend.send(apiKey, email, key),
    };
  }

  /** Cómo saldría un correo de esta empresa por el remitente de la plataforma. */
  async senderFor(tenantId: string) {
    const route = this.route();
    if (!route) return { available: false as const };
    const tenant = await this.tenantOf(tenantId);
    const sender = route.tenantSender(tenant.shownName);
    const sent = await this.repository.countRecent(tenantId);
    const { tenantDailyLimit } = this.config;
    return {
      available: true as const,
      fromAddress: sender.address,
      fromName: sender.name,
      replyTo: replyAddress(tenant.email),
      dailyLimit: tenantDailyLimit,
      sentToday: sent,
      remainingToday: remainingToday(sent, tenantDailyLimit),
    };
  }

  /** Un correo de una empresa a su cliente o proveedor. */
  async sendForTenant(
    input: TenantPlatformEmail,
  ): Promise<PlatformEmailResult> {
    const route = this.requireRoute();
    const { tenantDailyLimit } = this.config;
    const tenant = await this.tenantOf(input.tenantId);

    const sent = await this.repository.countRecent(input.tenantId);
    if (remainingToday(sent, tenantDailyLimit) === 0) {
      throw new PlatformEmailLimitError(tenantDailyLimit);
    }

    return this.deliver(route, input, {
      tenantId: input.tenantId,
      from: route.tenantSender(tenant.shownName),
      replyTo: replyAddress(input.replyTo) ?? replyAddress(tenant.email),
    });
  }

  /** Un correo de JoapyCore mismo: no pertenece a ninguna empresa. */
  async sendSystem(input: Content): Promise<PlatformEmailResult> {
    const route = this.requireRoute();
    return this.deliver(route, input, {
      tenantId: null,
      from: route.systemSender(),
      replyTo: null,
    });
  }

  private async deliver(
    route: Route,
    input: Content,
    envelope: {
      tenantId: string | null;
      from: { address: string; header: string };
      replyTo: string | null;
    },
  ): Promise<PlatformEmailResult> {
    const entry = {
      tenantId: envelope.tenantId,
      purpose: input.purpose,
      recipient: input.to,
      subject: input.subject,
      fromAddress: envelope.from.address,
      replyTo: envelope.replyTo,
    };
    try {
      const { id } = await route.send(
        {
          from: envelope.from.header,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
          replyTo: envelope.replyTo ?? undefined,
          attachments: input.attachment ? [input.attachment] : undefined,
          tags: [
            { name: 'purpose', value: resendTag(input.purpose) },
            ...(envelope.tenantId
              ? [{ name: 'tenant_id', value: resendTag(envelope.tenantId) }]
              : []),
          ],
        },
        input.idempotencyKey ?? randomUUID(),
      );
      await this.repository.record({
        ...entry,
        status: 'SENT',
        providerMessageId: id,
      });
      return { messageId: id, from: envelope.from.address };
    } catch (error) {
      if (error instanceof PlatformDeliveryError) {
        // Sin destinatario ni asunto: el registro de la base ya los tiene.
        this.logger.warn(
          `Envío por la plataforma sin confirmar (${error.code}, ${input.purpose})`,
        );
        await this.repository.record({
          ...entry,
          status: error.ambiguous ? 'UNKNOWN' : 'FAILED',
          errorCode: error.code,
        });
      }
      throw error;
    }
  }

  private requireRoute(): Route {
    const route = this.route();
    if (!route) {
      throw new ServiceUnavailableException(
        'El remitente de la plataforma no está configurado',
      );
    }
    return route;
  }

  private async tenantOf(tenantId: string) {
    const tenant = await this.repository.findTenant(tenantId);
    if (!tenant) throw new NotFoundException('Empresa no encontrada');
    return {
      ...tenant,
      shownName: tenant.nombreFantasia?.trim() || tenant.name,
    };
  }
}
