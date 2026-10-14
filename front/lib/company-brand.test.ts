import { describe, expect, it } from 'vitest';
import { companyMonogram, companyOptions, currentCompany } from './company-brand';

describe('companyMonogram', () => {
  it('takes the first letter of the first two words', () => {
    expect(companyMonogram('Ferro S.A.')).toBe('FS');
    expect(companyMonogram('mueblería del centro')).toBe('MD');
    expect(companyMonogram('JoapyCore')).toBe('J');
    expect(companyMonogram('  ')).toBe('?');
  });
});

describe('currentCompany', () => {
  const brand = { id: 't1', name: 'Ferro', razonSocial: 'Ferro S.A.', ruc: '80012345-6', hasLogo: false };

  it('shows the trade name with the RUC', () => {
    expect(currentCompany(brand, 't1', 'Ferro S.A.')).toEqual({ id: 't1', name: 'Ferro', detail: 'RUC 80012345-6' });
  });

  it('falls back to the legal name when there is no RUC', () => {
    expect(currentCompany({ ...brand, ruc: null }, 't1', 'x')?.detail).toBe('Ferro S.A.');
  });

  // Antes de que llegue la respuesta ya se ve en qué empresa se está.
  it('uses the name of the session while loading', () => {
    expect(currentCompany(undefined, 't1', 'Ferro S.A.')).toEqual({ id: 't1', name: 'Ferro S.A.', detail: null });
    expect(currentCompany(undefined, undefined, undefined)).toBeNull();
  });
});

describe('companyOptions', () => {
  it('is the current company while a user belongs to only one', () => {
    const current = { id: 't1', name: 'Ferro', detail: null };
    expect(companyOptions(current)).toEqual([current]);
    expect(companyOptions(null)).toEqual([]);
  });
});
