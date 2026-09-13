// Validación de variables de entorno al arrancar. Falla rápido con un mensaje
// claro en vez de descubrir la falta en el primer request que la necesita (o,
// peor, caer en un valor por defecto inseguro sin que nadie se entere).

const REQUIRED = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'TEMP_PASSWORD_KEY'] as const;

// Secretos que cifran o firman: con menos de 32 caracteres son adivinables.
const MIN_SECRET_LENGTH = 32;
const SECRETS = ['JWT_ACCESS_SECRET', 'TEMP_PASSWORD_KEY'] as const;

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
    if (typeof value === 'string' && value !== '' && value.length < MIN_SECRET_LENGTH) {
      errors.push(`${key} debe tener al menos ${MIN_SECRET_LENGTH} caracteres`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuración inválida:\n- ${errors.join('\n- ')}`);
  }
  return config;
}
