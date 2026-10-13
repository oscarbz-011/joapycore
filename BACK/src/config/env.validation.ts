// Validación de variables de entorno al arrancar. Falla rápido con un mensaje
// claro en vez de descubrir la falta en el primer request que la necesita (o,
// peor, caer en un valor por defecto inseguro sin que nadie se entere).

import { addressOf } from '../platform-email/platform-email.util';

const REQUIRED = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'TEMP_PASSWORD_KEY',
] as const;

// Secretos que cifran o firman: con menos de 32 caracteres son adivinables.
const MIN_SECRET_LENGTH = 32;
const SECRETS = ['JWT_ACCESS_SECRET', 'TEMP_PASSWORD_KEY'] as const;

function platformEmailErrors(config: Record<string, unknown>): string[] {
  const errors: string[] = [];
  // Con una sola no envía y el error aparecería recién al primer correo.
  if (
    Boolean(config['RESEND_API_KEY']) !==
    Boolean(config['PLATFORM_EMAIL_DOMAIN'])
  ) {
    errors.push(
      'RESEND_API_KEY y PLATFORM_EMAIL_DOMAIN van juntas: definí las dos o ninguna',
    );
  }
  const driver = config['PLATFORM_EMAIL_DRIVER'];
  if (driver && driver !== 'resend' && driver !== 'smtp') {
    errors.push('PLATFORM_EMAIL_DRIVER debe ser "resend" o "smtp"');
  }
  const from = config['SMTP_FROM'];
  if (
    driver === 'smtp' &&
    (!config['SMTP_HOST'] ||
      typeof from !== 'string' ||
      addressOf(from) === null)
  ) {
    errors.push(
      'PLATFORM_EMAIL_DRIVER="smtp" necesita SMTP_HOST y una dirección en SMTP_FROM',
    );
  }
  return errors;
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];

  for (const key of REQUIRED) {
    if (typeof config[key] !== 'string' || config[key] === '') {
      errors.push(`${key} es obligatoria`);
    }
  }
  for (const key of SECRETS) {
    const value = config[key];
    if (
      typeof value === 'string' &&
      value !== '' &&
      value.length < MIN_SECRET_LENGTH
    ) {
      errors.push(`${key} debe tener al menos ${MIN_SECRET_LENGTH} caracteres`);
    }
  }
  // En producción no se acepta CORS abierto por omisión.
  if (config['NODE_ENV'] === 'production' && !config['CORS_ORIGINS']) {
    errors.push('CORS_ORIGINS es obligatoria en producción');
  }

  errors.push(...platformEmailErrors(config));

  if (errors.length > 0) {
    throw new Error(`Configuración inválida:\n- ${errors.join('\n- ')}`);
  }
  return config;
}
