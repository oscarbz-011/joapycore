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
import type { PlatformEmailConfig } from '../config/platform-email.config';
import { PlatformEmailRepository } from './platform-email.repository';
import {
  remainingToday,
  replyAddress,
  resendTag,
  systemSender,
  tenantSender,
} from './platform-email.util';
import { ResendClient, ResendDeliveryError } from './resend.client';

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
 * Todas las empresas comparten el dominio, y con él la reputación: por eso
 * cada una tiene un tope diario y sale identificada con su nombre.
 */
@Injectable()
export class PlatformEmailService {
  private readonly logger = new Logger(PlatformEmailService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly repository: PlatformEmailRepository,
    private readonly resend: ResendClient,
  ) {}

  private get config(): PlatformEmailConfig {
    return this.configService.get<PlatformEmailConfig>('platformEmail')!;
  }

  /** Hay clave y dominio: el remitente puede enviar. */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.domain);
  }

  /** Cómo saldría un correo de esta empresa por el remitente de la plataforma. */
  async senderFor(tenantId: string) {
    const config = this.config;
    if (!config.apiKey || !config.domain) return { available: false as const };
    const tenant = await this.tenantOf(tenantId);
    const sender = tenantSender(tenant.shownName, config.brand, config.domain);
    const sent = await this.repository.countRecent(tenantId);
    return {
      available: true as const,
      fromAddress: sender.address,
      fromName: sender.name,
      replyTo: replyAddress(tenant.email),
      dailyLimit: config.tenantDailyLimit,
      sentToday: sent,
      remainingToday: remainingToday(sent, config.tenantDailyLimit),
    };
  }

  /** Un correo de una empresa a su cliente o proveedor. */
  async sendForTenant(
    input: TenantPlatformEmail,
  ): Promise<PlatformEmailResult> {
    const config = this.requireConfig();
    const tenant = await this.tenantOf(input.tenantId);

    const sent = await this.repository.countRecent(input.tenantId);
    if (remainingToday(sent, config.tenantDailyLimit) === 0) {
      throw new PlatformEmailLimitError(config.tenantDailyLimit);
    }

    const sender = tenantSender(tenant.shownName, config.brand, config.domain);
    return this.deliver(config.apiKey, input, {
      tenantId: input.tenantId,
      from: sender,
      replyTo: replyAddress(input.replyTo) ?? replyAddress(tenant.email),
    });
  }

  /** Un correo de JoapyCore mismo: no pertenece a ninguna empresa. */
  async sendSystem(input: Content): Promise<PlatformEmailResult> {
    const config = this.requireConfig();
    return this.deliver(config.apiKey, input, {
      tenantId: null,
      from: systemSender(config.brand, config.systemLocalPart, config.domain),
      replyTo: null,
    });
  }

  private async deliver(
    apiKey: string,
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
      const { id } = await this.resend.send(
        apiKey,
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
      if (error instanceof ResendDeliveryError) {
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

  private requireConfig() {
    const { apiKey, domain, ...rest } = this.config;
    if (!apiKey || !domain) {
      throw new ServiceUnavailableException(
        'El remitente de la plataforma no está configurado',
      );
    }
    return { ...rest, apiKey, domain };
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
