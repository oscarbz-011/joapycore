import { registerAs } from '@nestjs/config';

// El remitente de la plataforma: los correos propios de JoapyCore y los de las
// empresas que todavía no conectaron su correo. Sale por Resend desde un único
// dominio de JoapyCore, verificado una sola vez por nosotros.
export type PlatformEmailDriver = 'resend' | 'smtp';

export interface PlatformEmailConfig {
  /** Por dónde sale: Resend, o el servidor SMTP_* del .env. */
  driver: PlatformEmailDriver;
  apiKey?: string;
  /** Dominio verificado en Resend, p. ej. "correo.joapycore.com". */
  domain?: string;
  /** Nombre que acompaña al remitente: "JoapyCore". */
  brand: string;
  /** Parte local de los correos propios de la plataforma. */
  systemLocalPart: string;
  /** Tope de correos por empresa en 24 horas por este remitente. */
  tenantDailyLimit: number;
}

export const DEFAULT_TENANT_DAILY_LIMIT = 200;

export default registerAs('platformEmail', (): PlatformEmailConfig => {
  const limit = Number(process.env['PLATFORM_EMAIL_TENANT_DAILY_LIMIT']);
  return {
    driver: process.env['PLATFORM_EMAIL_DRIVER'] === 'smtp' ? 'smtp' : 'resend',
    apiKey: process.env['RESEND_API_KEY'] || undefined,
    domain:
      process.env['PLATFORM_EMAIL_DOMAIN']?.trim().toLowerCase() || undefined,
    brand: process.env['PLATFORM_EMAIL_BRAND']?.trim() || 'JoapyCore',
    systemLocalPart:
      process.env['PLATFORM_EMAIL_SYSTEM_LOCAL_PART']?.trim() || 'no-reply',
    tenantDailyLimit:
      Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_TENANT_DAILY_LIMIT,
  };
});
