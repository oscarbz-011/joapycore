// Configuración de seguridad HTTP compartida por main.ts (REST) y el gateway
// de WebSocket. Se lee process.env en cada llamada, no al importar: los
// decoradores de @WebSocketGateway se evalúan antes de que ConfigModule cargue
// el .env.

export function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * - Sin header Origin (curl, server-to-server, mismo origen): permitido; CORS
 *   solo protege a navegadores.
 * - CORS_ORIGINS definida: solo esos orígenes.
 * - CORS_ORIGINS vacía: cualquier origen fuera de producción (desarrollo en la
 *   LAN con IPs cambiantes); en producción, ninguno. env.validation.ts ya
 *   impide arrancar en producción sin la variable.
 */
export function isOriginAllowed(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!origin) return true;
  const allowed = parseCorsOrigins(env.CORS_ORIGINS);
  if (allowed.length === 0) return env.NODE_ENV !== 'production';
  return allowed.includes(origin.replace(/\/+$/, ''));
}

export function corsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  callback(null, isOriginAllowed(origin));
}

/** Swagger: explícito con SWAGGER_ENABLED; si no, apagado en producción. */
export function isSwaggerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.SWAGGER_ENABLED !== undefined) return env.SWAGGER_ENABLED === 'true';
  return env.NODE_ENV !== 'production';
}

// Límites de requests por IP. El global es holgado porque una pantalla del
// front dispara varias queries en paralelo; los de auth son estrictos contra
// fuerza bruta y altas masivas de tenants.
export const THROTTLE = {
  global: { ttl: 60_000, limit: 600 },
  login: { ttl: 60_000, limit: 10 },
  register: { ttl: 60 * 60_000, limit: 5 },
  refresh: { ttl: 60_000, limit: 60 },
} as const;
