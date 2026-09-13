import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { tokenStore } from '../token-store';
import { ApiError } from './api-error';
import { API_BASE, refreshSessionTokens } from './session-refresh';

// Subidas, descargas de archivos y generación de PDF/email pueden tardar
// bastante más que una consulta: el servidor termina bien pero el cliente
// cortaba a los 12 s y mostraba un error.
export const LONG_REQUEST_TIMEOUT_MS = 120_000;

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 12000,
});

apiClient.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

apiClient.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      throw new ApiError('Error inesperado.', 0);
    }

    // Solo se intenta renovar si la request iba autenticada. Los endpoints
    // públicos (/auth/login, /auth/register, /auth/refresh) no llevan
    // Authorization, así se evitan bucles.
    const original = error.config as RetriableConfig | undefined;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      original.headers?.Authorization
    ) {
      return retryAfterRenewingSession(error, original);
    }

    throw toApiError(error);
  },
);

async function retryAfterRenewingSession(error: AxiosError, original: RetriableConfig) {
  original._retry = true;
  const sentAuth = original.headers.Authorization;
  const renewedElsewhere = () => {
    const token = tokenStore.getAccessToken();
    return token && `Bearer ${token}` !== sentAuth ? token : null;
  };
  const retryWith = (token: string) => {
    original.headers.Authorization = `Bearer ${token}`;
    return apiClient(original);
  };

  // Otro flujo ya renovó la sesión mientras esta request viajaba (otra
  // request que refrescó, o volver a autenticarse tras cambiar la
  // contraseña): se reintenta con ese token, sin rotar de nuevo.
  const already = renewedElsewhere();
  if (already) return retryWith(already);
  if (!tokenStore.getRefreshToken()) throw toApiError(error);

  try {
    const data = await refreshSessionTokens();
    return retryWith(data.accessToken);
  } catch {
    // Si en el medio alguien dejó una sesión nueva, se usa esa en vez de
    // cerrar la sesión del usuario.
    const latest = renewedElsewhere();
    if (latest) return retryWith(latest);
    tokenStore.clear();
    // Fuera de React no hay router: recarga completa a /login, que además
    // descarta todo el estado en memoria de la sesión que terminó.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw toApiError(error);
  }
}

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
    429: 'Demasiadas solicitudes. Esperá un momento y volvé a intentar.',
  };
  return map[status] ?? 'Ocurrió un error. Intentá de nuevo.';
}
