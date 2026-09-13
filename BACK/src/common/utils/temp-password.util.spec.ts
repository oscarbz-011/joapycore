import {
  decryptTempPassword,
  encryptTempPassword,
} from './temp-password.util';
import { validateEnv } from '../../config/env.validation';

describe('temp-password.util', () => {
  const original = process.env.TEMP_PASSWORD_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.TEMP_PASSWORD_KEY;
    else process.env.TEMP_PASSWORD_KEY = original;
  });

  it('round-trips with the configured key', () => {
    process.env.TEMP_PASSWORD_KEY = 'a'.repeat(64);
    const encrypted = encryptTempPassword('Abc123xyz!');
    expect(encrypted).not.toContain('Abc123xyz!');
    expect(decryptTempPassword(encrypted)).toBe('Abc123xyz!');
  });

  it('refuses to encrypt without a key instead of using a hardcoded fallback', () => {
    delete process.env.TEMP_PASSWORD_KEY;
    expect(() => encryptTempPassword('x')).toThrow(/TEMP_PASSWORD_KEY/);
  });

  it('cannot decrypt a value encrypted with a different key', () => {
    process.env.TEMP_PASSWORD_KEY = 'a'.repeat(64);
    const encrypted = encryptTempPassword('secreto');
    process.env.TEMP_PASSWORD_KEY = 'b'.repeat(64);
    expect(() => decryptTempPassword(encrypted)).toThrow();
  });

  // Regresión: el valor que antes se usaba como fallback ya no descifra nada.
  it('does not accept the old hardcoded fallback key', () => {
    process.env.TEMP_PASSWORD_KEY = 'a'.repeat(64);
    const encrypted = encryptTempPassword('secreto');
    process.env.TEMP_PASSWORD_KEY = 'dev-fallback-secret';
    expect(() => decryptTempPassword(encrypted)).toThrow();
  });
});

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://x',
    JWT_ACCESS_SECRET: 'j'.repeat(32),
    TEMP_PASSWORD_KEY: 't'.repeat(32),
  };

  it('accepts a complete configuration', () => {
    expect(validateEnv(base)).toBe(base);
  });

  it('fails listing every missing variable', () => {
    expect(() => validateEnv({})).toThrow(
      /DATABASE_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*TEMP_PASSWORD_KEY/,
    );
  });

  it('rejects secrets shorter than 32 characters', () => {
    expect(() => validateEnv({ ...base, TEMP_PASSWORD_KEY: 'corta' })).toThrow(
      /TEMP_PASSWORD_KEY debe tener al menos 32/,
    );
  });
});
