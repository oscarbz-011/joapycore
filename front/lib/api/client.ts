import axios from 'axios';
import { tokenStore } from '../token-store';
import type { AuthTokens } from '../../types/auth';
import { ApiError } from './api-error';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
type QueueCallback = (token: string) => void;
let refreshQueue: QueueCallback[] = [];

apiClient.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(new ApiError('Error inesperado.', 0));
    }

    const original = error.config as typeof error.config & { _retry?: boolean };
    const status = error.response?.status ?? 0;

    // ── Token refresh on 401 ────────────────────────────────────────────────
    if (status === 401 && !original?._retry && original) {
      original._retry = true;

      const refreshToken = tokenStore.getRefreshToken();
      if (!refreshToken) {
        return Promise.reject(toApiError(error));
      }

      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshQueue.push((token) => {
            if (original.headers) original.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const { data } = await axios.post<AuthTokens>(`${API_BASE}/auth/refresh`, {
          refreshToken,
        });
        tokenStore.setAccessToken(data.accessToken);
        tokenStore.setRefreshToken(data.refreshToken);
        refreshQueue.forEach((cb) => cb(data.accessToken));
        refreshQueue = [];
        if (original.headers) original.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(original);
      } catch {
        tokenStore.clear();
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(toApiError(error));
      } finally {
        isRefreshing = false;
      }
    }

    // ── Normalize all other errors to ApiError ──────────────────────────────
    return Promise.reject(toApiError(error));
  },
);

function toApiError(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) {
    return new ApiError('Error inesperado.', 0);
  }

  // No response at all = network down or backend unreachable
  if (!error.response) {
    return new ApiError(
      'No se pudo conectar con el servidor. Verificá que el servicio esté activo.',
      0,
      true,
    );
  }

  const status = error.response.status;
  const data = error.response.data as Record<string, unknown> | undefined;

  // 4xx: use the message from the API (it's safe — comes from HttpException)
  if (status < 500) {
    const msg = extractMessage(data) ?? friendlyStatus(status);
    return new ApiError(msg, status);
  }

  // 5xx: never expose server internals — generic message only
  return new ApiError('Error del servidor. Intentá de nuevo más tarde.', status);
}

function extractMessage(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const msg = data['message'];
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg) && msg.length > 0) return msg.join(', ');
  return null;
}

function friendlyStatus(status: number): string {
  const map: Record<number, string> = {
    400: 'La solicitud tiene datos inválidos.',
    401: 'Tu sesión expiró. Iniciá sesión de nuevo.',
    403: 'No tenés permiso para realizar esta acción.',
    404: 'El recurso solicitado no existe.',
    409: 'Ya existe un registro con esos datos.',
    422: 'No se puede procesar la solicitud con el estado actual.',
  };
  return map[status] ?? 'Ocurrió un error. Intentá de nuevo.';
}
