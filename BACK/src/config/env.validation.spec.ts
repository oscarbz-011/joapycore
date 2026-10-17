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

  it('accepts sending through the SMTP server with a host and an address', () => {
    expect(() =>
      validateEnv({
        ...base,
        PLATFORM_EMAIL_DRIVER: 'smtp',
        SMTP_HOST: 'smtp.zoho.com',
        SMTP_FROM: 'JoapyCore <avisos@joapycore.com>',
      }),
    ).not.toThrow();
  });

  it('refuses the SMTP driver without a host or without an address to send from', () => {
    const smtp = { ...base, PLATFORM_EMAIL_DRIVER: 'smtp' };
    expect(() => validateEnv({ ...smtp, SMTP_FROM: 'a@b.com' })).toThrow(
      /necesita SMTP_HOST/,
    );
    expect(() =>
      validateEnv({
        ...smtp,
        SMTP_HOST: 'smtp.zoho.com',
        SMTP_FROM: 'JoapyCore',
      }),
    ).toThrow(/necesita SMTP_HOST/);
  });

  it('refuses a driver that does not exist', () => {
    expect(() =>
      validateEnv({ ...base, PLATFORM_EMAIL_DRIVER: 'sendgrid' }),
    ).toThrow(/debe ser "resend" o "smtp"/);
  });

  it('treats empty values as not set', () => {
    expect(() =>
      validateEnv({ ...base, RESEND_API_KEY: '', PLATFORM_EMAIL_DOMAIN: '' }),
    ).not.toThrow();
  });
});
