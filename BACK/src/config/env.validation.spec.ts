import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://localhost/joapycore',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  TEMP_PASSWORD_KEY: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts a configuration without the platform sender', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it('accepts the platform sender with its key and its domain', () => {
    expect(() =>
      validateEnv({
        ...base,
        RESEND_API_KEY: 're_key',
        PLATFORM_EMAIL_DOMAIN: 'correo.joapycore.com',
      }),
    ).not.toThrow();
  });

  // Con una sola, el error aparecería recién al mandar el primer correo.
  it('refuses a key without a domain, and a domain without a key', () => {
    expect(() => validateEnv({ ...base, RESEND_API_KEY: 're_key' })).toThrow(
      /RESEND_API_KEY y PLATFORM_EMAIL_DOMAIN van juntas/,
    );
    expect(() =>
      validateEnv({ ...base, PLATFORM_EMAIL_DOMAIN: 'correo.joapycore.com' }),
    ).toThrow(/van juntas/);
  });

  it('treats empty values as not set', () => {
    expect(() =>
      validateEnv({ ...base, RESEND_API_KEY: '', PLATFORM_EMAIL_DOMAIN: '' }),
    ).not.toThrow();
  });
});
