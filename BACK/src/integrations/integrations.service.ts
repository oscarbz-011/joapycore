import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { UpdateEmailIntegrationDto } from './dto/update-email-integration.dto';
import {
  decryptIntegrationConfig,
  encryptIntegrationConfig,
} from './integration-credentials.util';
import { IntegrationsRepository } from './integrations.repository';

export const SMTP_INTEGRATION_KEY = 'smtp';

export interface SmtpIntegrationConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromEmail: string;
  fromName?: string;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly repository: IntegrationsRepository,
    private readonly configService: ConfigService,
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
    const row = await this.repository.findByKey(tenantId, SMTP_INTEGRATION_KEY);
    if (!row?.encryptedConfig) {
      return {
        enabled: false,
        configured: false,
        status: 'DISCONNECTED' as const,
        host: '',
        port: 587,
        secure: false,
        user: '',
        fromEmail: '',
        fromName: '',
        hasPassword: false,
        lastTestedAt: null,
        lastTestOk: null,
      };
    }
    const config = this.decrypt(row.encryptedConfig);
    return {
      enabled: row.enabled,
      configured: true,
      status: row.status,
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user ?? '',
      fromEmail: config.fromEmail,
      fromName: config.fromName ?? '',
      hasPassword: Boolean(config.password),
      lastTestedAt: row.lastTestedAt,
      lastTestOk: row.lastTestOk,
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
      ? this.decrypt(existing.encryptedConfig)
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

  async testEmailIntegration(tenantId: string) {
    const row = await this.repository.findByKey(tenantId, SMTP_INTEGRATION_KEY);
    if (!row?.encryptedConfig) {
      throw new ServiceUnavailableException(
        'Primero guardá la configuración de correo',
      );
    }
    const config = this.decrypt(row.encryptedConfig);
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

  async getEnabledSmtpConfig(
    tenantId: string,
  ): Promise<SmtpIntegrationConfig | null> {
    const row = await this.repository.findByKey(tenantId, SMTP_INTEGRATION_KEY);
    if (!row?.enabled || !row.encryptedConfig) return null;
    return this.decrypt(row.encryptedConfig);
  }

  private decrypt(value: string): SmtpIntegrationConfig {
    return decryptIntegrationConfig<SmtpIntegrationConfig>(
      value,
      this.secret(),
    );
  }
}
