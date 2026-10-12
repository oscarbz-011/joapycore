const DEFAULT_API_BASE = 'http://localhost:3000';

/**
 * Dirección de la API sin barra final. Las rutas se le pegan con su propia
 * barra: con "https://api.ejemplo.com/" la renovación de sesión y el socket
 * de notificaciones salían a "//auth/refresh" y "//notifications", que el
 * servidor no reconoce.
 */
export function apiBase(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/\/+$/, '') || DEFAULT_API_BASE;
}
