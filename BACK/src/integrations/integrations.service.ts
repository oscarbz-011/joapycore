import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { UpdateIncomingEmailIntegrationDto } from './dto/update-incoming-email-integration.dto';
import type { UpdateEmailIntegrationDto } from './dto/update-email-integration.dto';
import { ImapConnectionService } from './imap-connection.service';
import {
  decryptIntegrationConfig,
  encryptIntegrationConfig,
} from './integration-credentials.util';
import { IntegrationsRepository } from './integrations.repository';

export const SMTP_INTEGRATION_KEY = 'smtp';
export const IMAP_INTEGRATION_KEY = 'imap';

export interface SmtpIntegrationConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromEmail: string;
  fromName?: string;
}

export interface ImapIntegrationConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly repository: IntegrationsRepository,
    private readonly configService: ConfigService,
    private readonly imapConnection: ImapConnectionService,
  ) {}

  private secret(): string {
    const secret = this.configService.get<string>(
      'INTEGRATIONS_ENCRYPTION_KEY',
    );
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'INTEGRATIONS_ENCRYPTION_KEY debe estar configurada con al menos 32 caracteres',
      );
    }
    return secret;
  }

  async getEmailIntegration(tenantId: string) {
    const [row, incomingRow] = await Promise.all([
      this.repository.findByKey(tenantId, SMTP_INTEGRATION_KEY),
      this.repository.findByKey(tenantId, IMAP_INTEGRATION_KEY),
    ]);
    const config = row?.encryptedConfig
      ? this.decrypt<SmtpIntegrationConfig>(row.encryptedConfig)
      : undefined;
    const incomingConfig = incomingRow?.encryptedConfig
      ? this.decrypt<ImapIntegrationConfig>(incomingRow.encryptedConfig)
      : undefined;
    return {
      enabled: row?.enabled ?? false,
      configured: Boolean(config),
      status: row?.status ?? ('DISCONNECTED' as const),
      host: config?.host ?? '',
      port: config?.port ?? 587,
      secure: config?.secure ?? false,
      user: config?.user ?? '',
      fromEmail: config?.fromEmail ?? '',
      fromName: config?.fromName ?? '',
      hasPassword: Boolean(config?.password),
      lastTestedAt: row?.lastTestedAt ?? null,
      lastTestOk: row?.lastTestOk ?? null,
      incoming: {
        enabled: incomingRow?.enabled ?? false,
        configured: Boolean(incomingConfig),
        status: incomingRow?.status ?? ('DISCONNECTED' as const),
        host: incomingConfig?.host ?? '',
        port: incomingConfig?.port ?? 993,
        secure: incomingConfig?.secure ?? true,
        user: incomingConfig?.user ?? '',
        hasPassword: Boolean(incomingConfig?.password),
        lastTestedAt: incomingRow?.lastTestedAt ?? null,
        lastTestOk: incomingRow?.lastTestOk ?? null,
      },
    };
  }

  async updateEmailIntegration(
    tenantId: string,
    dto: UpdateEmailIntegrationDto,
  ) {
    const existing = await this.repository.findByKey(
      tenantId,
      SMTP_INTEGRATION_KEY,
    );
    const previous = existing?.encryptedConfig
      ? this.decrypt<SmtpIntegrationConfig>(existing.encryptedConfig)
      : undefined;
    const config: SmtpIntegrationConfig = {
      host: dto.host.trim(),
      port: dto.port,
      secure: dto.secure,
      user: dto.user?.trim() || undefined,
      password: dto.password || previous?.password,
      fromEmail: dto.fromEmail.trim(),
      fromName: dto.fromName?.trim() || undefined,
    };
    await this.repository.upsert(tenantId, SMTP_INTEGRATION_KEY, {
      enabled: dto.enabled,
      status: 'DISCONNECTED',
      encryptedConfig: encryptIntegrationConfig(config, this.secret()),
      lastError: null,
      lastTestedAt: null,
      lastTestOk: null,
    });
    return this.getEmailIntegration(tenantId);
  }

  async updateIncomingEmailIntegration(
    tenantId: string,
    dto: UpdateIncomingEmailIntegrationDto,
  ) {
    const existing = await this.repository.findByKey(
      tenantId,
      IMAP_INTEGRATION_KEY,
    );
    const previous = existing?.encryptedConfig
      ? this.decrypt<ImapIntegrationConfig>(existing.encryptedConfig)
      : undefined;
    const config: ImapIntegrationConfig = {
      host: dto.host.trim(),
      port: dto.port,
      secure: dto.secure,
      user: dto.user.trim(),
      password: dto.password || previous?.password,
    };
    await this.repository.upsert(tenantId, IMAP_INTEGRATION_KEY, {
      enabled: dto.enabled,
      status: 'DISCONNECTED',
      encryptedConfig: encryptIntegrationConfig(config, this.secret()),
      lastError: null,
      lastTestedAt: null,
      lastTestOk: null,
    });
    return this.getEmailIntegration(tenantId);
  }

  async testEmailIntegration(tenantId: string) {
    const row = await this.repository.findByKey(tenantId, SMTP_INTEGRATION_KEY);
    if (!row?.encryptedConfig) {
      throw new ServiceUnavailableException(
        'Primero guardá la configuración de correo',
      );
    }
    const config = this.decrypt<SmtpIntegrationConfig>(row.encryptedConfig);
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user
        ? { user: config.user, pass: config.password }
        : undefined,
    });
    try {
      await transporter.verify();
      await this.repository.markTestResult(
        tenantId,
        SMTP_INTEGRATION_KEY,
        true,
      );
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.markTestResult(
        tenantId,
        SMTP_INTEGRATION_KEY,
        false,
        message,
      );
      throw new BadGatewayException(
        'No se pudo conectar con el servidor SMTP. Revisá los datos y volvé a intentar.',
      );
    } finally {
      transporter.close();
    }
  }

  async testIncomingEmailIntegration(tenantId: string) {
    const row = await this.repository.findByKey(tenantId, IMAP_INTEGRATION_KEY);
    if (!row?.encryptedConfig) {
      throw new ServiceUnavailableException(
        'Primero guardá la configuración de correo entrante',
      );
    }
    const config = this.decrypt<ImapIntegrationConfig>(row.encryptedConfig);
    try {
      await this.imapConnection.verify(config);
      await this.repository.markTestResult(
        tenantId,
        IMAP_INTEGRATION_KEY,
        true,
      );
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.markTestResult(
        tenantId,
        IMAP_INTEGRATION_KEY,
        false,
        message,
      );
      throw new BadGatewayException(
        'No se pudo conectar con el servidor IMAP. Revisá los datos y volvé a intentar.',
      );
    }
  }

  async getEnabledSmtpConfig(
    tenantId: string,
  ): Promise<SmtpIntegrationConfig | null> {
    const row = await this.repository.findByKey(tenantId, SMTP_INTEGRATION_KEY);
    if (!row?.enabled || !row.encryptedConfig) return null;
    return this.decrypt<SmtpIntegrationConfig>(row.encryptedConfig);
  }

  async getEnabledImapConfig(
    tenantId: string,
  ): Promise<ImapIntegrationConfig | null> {
    const row = await this.repository.findByKey(tenantId, IMAP_INTEGRATION_KEY);
    if (!row?.enabled || !row.encryptedConfig) return null;
    return this.decrypt<ImapIntegrationConfig>(row.encryptedConfig);
  }

  private decrypt<T>(value: string): T {
    return decryptIntegrationConfig<T>(value, this.secret());
  }
}
