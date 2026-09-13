import {
  isOriginAllowed,
  isSwaggerEnabled,
  parseCorsOrigins,
} from './security.config';
import { validateEnv } from './env.validation';

describe('parseCorsOrigins', () => {
  it('splits, trims and drops trailing slashes and empties', () => {
    expect(parseCorsOrigins(' https://a.com/, http://b.com:3001 ,, ')).toEqual([
      'https://a.com',
      'http://b.com:3001',
    ]);
    expect(parseCorsOrigins(undefined)).toEqual([]);
  });
});

describe('isOriginAllowed', () => {
  it('allows requests without Origin (curl, server-to-server)', () => {
    expect(isOriginAllowed(undefined, { NODE_ENV: 'production' })).toBe(true);
  });

  it('only allows listed origins when CORS_ORIGINS is set', () => {
    const env = { CORS_ORIGINS: 'https://app.joapy.com' };
    expect(isOriginAllowed('https://app.joapy.com', env)).toBe(true);
    expect(isOriginAllowed('https://app.joapy.com/', env)).toBe(true);
    expect(isOriginAllowed('https://evil.com', env)).toBe(false);
  });

  it('allows any origin in development when CORS_ORIGINS is empty', () => {
    expect(
      isOriginAllowed('http://192.168.1.50:3001', { NODE_ENV: 'development' }),
    ).toBe(true);
  });

  it('denies every browser origin in production when CORS_ORIGINS is empty', () => {
    expect(
      isOriginAllowed('https://app.joapy.com', { NODE_ENV: 'production' }),
    ).toBe(false);
  });
});

describe('isSwaggerEnabled', () => {
  it('is off in production by default and on elsewhere', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isSwaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
  });

  it('respects an explicit SWAGGER_ENABLED', () => {
    expect(
      isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }),
    ).toBe(true);
    expect(
      isSwaggerEnabled({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' }),
    ).toBe(false);
  });
});

describe('validateEnv (production)', () => {
  const base = {
    DATABASE_URL: 'postgresql://x',
    JWT_ACCESS_SECRET: 'j'.repeat(32),
    TEMP_PASSWORD_KEY: 't'.repeat(32),
  };

  it('requires CORS_ORIGINS in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /CORS_ORIGINS/,
    );
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.joapy.com',
      }),
    ).not.toThrow();
  });
});
