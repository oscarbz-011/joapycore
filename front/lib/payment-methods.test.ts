import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAYMENT_METHODS, paymentMethodLabel } from './payment-methods';

describe('payment methods', () => {
  // La lista del front tiene que ser exactamente el enum de Prisma: un valor
  // de más hace fallar el cobro en el backend.
  it('matches the PaymentMethod enum of the Prisma schema', () => {
    const modelsDir = fileURLToPath(
      new URL('../../BACK/prisma/models/', import.meta.url),
    );
    const schema = readdirSync(modelsDir)
      .filter((name) => name.endsWith('.prisma'))
      .map((name) => readFileSync(join(modelsDir, name), 'utf8'))
      .join('\n');
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
