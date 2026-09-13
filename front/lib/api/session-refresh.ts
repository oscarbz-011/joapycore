import axios from 'axios';
import { tokenStore } from '../token-store';
import type { AuthTokens } from '../../types/auth';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const LOCK_NAME = 'joapy-auth-refresh';

let inFlight: Promise<AuthTokens> | null = null;

/**
 * Rota el refresh token y guarda el par nuevo. Único punto del front que llama
 * a /auth/refresh.
 *
 * El refresh token es de un solo uso y se comparte entre pestañas
 * (localStorage). Si dos pestañas lo rotan a la vez, la segunda presenta un
 * token ya revocado y el backend la rechaza (y fuera de la ventana de gracia
 * lo toma como robo y cierra todas las sesiones). Por eso:
 * - dentro de la pestaña, las llamadas concurrentes comparten una promesa;
 * - entre pestañas, Web Locks serializa y el token se lee DENTRO del lock,
 *   así la pestaña que espera usa el que dejó guardado la anterior.
 */
export function refreshSessionTokens(): Promise<AuthTokens> {
  inFlight ??= withCrossTabLock(rotate).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function rotate(): Promise<AuthTokens> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) throw new Error('No hay sesión para renovar');
  const { data } = await axios.post<AuthTokens>(
    `${API_BASE}/auth/refresh`,
    { refreshToken },
    { timeout: 12000 },
  );
  tokenStore.setAccessToken(data.accessToken);
  tokenStore.setRefreshToken(data.refreshToken);
  return data;
}

async function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return await navigator.locks.request(LOCK_NAME, fn);
  }
  return fn();
}
