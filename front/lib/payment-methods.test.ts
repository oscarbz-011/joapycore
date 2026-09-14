import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAYMENT_METHODS, paymentMethodLabel } from './payment-methods';

describe('payment methods', () => {
  // La lista del front tiene que ser exactamente el enum de Prisma: un valor
  // de más hace fallar el cobro en el backend.
  it('matches the PaymentMethod enum of the Prisma schema', () => {
    const schema = readFileSync(
      fileURLToPath(new URL('../../BACK/prisma/schema.prisma', import.meta.url)),
      'utf8',
    );
    const block = schema.match(/enum PaymentMethod \{([^}]*)\}/)?.[1] ?? '';
    const values = block.split(/\s+/).filter(Boolean);
    expect([...PAYMENT_METHODS].sort()).toEqual(values.sort());
  });

  it('labels known and unknown methods', () => {
    expect(paymentMethodLabel('CHECK')).toBe('Cheque');
    expect(paymentMethodLabel('LEGACY')).toBe('LEGACY');
    expect(paymentMethodLabel(null)).toBe('Sin método');
  });
});
