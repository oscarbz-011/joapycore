import { describe, expect, it } from 'vitest';
import { ApiError } from './api/api-error';
import { contractLoadErrorMessage } from './contract-card';

describe('contractLoadErrorMessage', () => {
  it('explains a missing permission instead of showing an empty box', () => {
    expect(contractLoadErrorMessage(new ApiError('Forbidden', 403))).toEqual({
      text: 'No tenés permiso para ver el contrato de esta venta.',
      canRetry: false,
    });
  });

  it('offers to retry any other failure', () => {
    expect(contractLoadErrorMessage(new ApiError('Error', 500))).toEqual({
      text: 'No se pudo cargar el contrato.',
      canRetry: true,
    });
    expect(contractLoadErrorMessage(new Error('network'))).toMatchObject({
      canRetry: true,
    });
  });
});
