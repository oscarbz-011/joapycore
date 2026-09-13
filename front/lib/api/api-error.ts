export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly isNetworkError: boolean = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * Mensaje para mostrarle al usuario a partir de un error de una llamada a la
 * API. El interceptor de `apiClient` ya convierte toda respuesta de error en
 * `ApiError` con el mensaje del backend (validaciones, reglas de negocio), así
 * que ese objeto NO tiene `response.data`: leer `err.response?.data?.message`
 * siempre da undefined y termina mostrando el fallback genérico.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (isApiError(err) && err.message) return err.message;
  return fallback;
}
