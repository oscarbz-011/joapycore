import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorMessage } from './api-error';

describe('apiErrorMessage', () => {
  it('shows the message the backend sent', () => {
    expect(apiErrorMessage(new ApiError('No hay stock suficiente de: Heladera', 422), 'Error')).toBe(
      'No hay stock suficiente de: Heladera',
    );
  });

  // Regresión: 56 pantallas leían err.response.data.message, que en un
  // ApiError no existe, y mostraban siempre el texto genérico.
  it('does not depend on an axios-style response object', () => {
    const err = new ApiError('Falta el código del proveedor', 400);
    expect('response' in err).toBe(false);
    expect(apiErrorMessage(err, 'No se pudo importar')).toBe('Falta el código del proveedor');
  });

  it('falls back for anything that is not an ApiError', () => {
    expect(apiErrorMessage(new Error('boom'), 'Error al guardar')).toBe('Error al guardar');
    expect(apiErrorMessage(undefined, 'Error al guardar')).toBe('Error al guardar');
  });
});
