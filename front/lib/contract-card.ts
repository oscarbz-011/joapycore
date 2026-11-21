import { isApiError } from './api/api-error';

export function contractLoadErrorMessage(error: unknown): {
  text: string;
  canRetry: boolean;
} {
  if (isApiError(error) && error.status === 403) {
    return {
      text: 'No tenés permiso para ver el contrato de esta venta.',
      canRetry: false,
    };
  }
  return { text: 'No se pudo cargar el contrato.', canRetry: true };
}
