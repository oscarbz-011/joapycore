import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function encryptIntegrationConfig(
  value: object,
  secret: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyFrom(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptIntegrationConfig<T>(value: string, secret: string): T {
  const [version, ivValue, tagValue, encryptedValue] = value.split(':');
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Formato de credencial de integración inválido');
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    keyFrom(secret),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}
