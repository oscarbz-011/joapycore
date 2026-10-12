import { describe, expect, it } from 'vitest';
import { apiBase } from './api-base';

describe('apiBase', () => {
  it('uses the configured address as is', () => {
    expect(apiBase('https://api.joapy.com')).toBe('https://api.joapy.com');
  });

  // Con la barra final, `${base}/auth/refresh` salía a "//auth/refresh" (404).
  it('drops a trailing slash', () => {
    expect(apiBase('https://abc-3000.brs.devtunnels.ms/')).toBe(
      'https://abc-3000.brs.devtunnels.ms',
    );
    expect(apiBase(' http://192.168.100.4:3000// ')).toBe('http://192.168.100.4:3000');
  });

  it('falls back to the local server when nothing is configured', () => {
    expect(apiBase(undefined)).toBe('http://localhost:3000');
    expect(apiBase('   ')).toBe('http://localhost:3000');
  });
});
