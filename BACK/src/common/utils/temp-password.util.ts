import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
export const TEMP_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Clave propia y sin fallback. Antes leía JWT_SECRET, una variable que nunca
// existió, así que siempre caía en una constante escrita en el código: con
// acceso a la base cualquiera podía descifrar las contraseñas temporales.
// env.validation.ts exige la variable al arrancar, así que acá no debería
// faltar nunca.
function deriveKey(): Buffer {
  const secret = process.env.TEMP_PASSWORD_KEY;
  if (!secret) throw new Error('TEMP_PASSWORD_KEY no está configurada');
  return createHash('sha256').update(secret).digest(); // 32 bytes for AES-256
}

export function generateTempPassword(): string {
  return randomBytes(8).toString('base64url').slice(0, 10);
}

export function encryptTempPassword(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptTempPassword(data: string): string {
  const parts = data.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted temp password format');
  const [ivHex, tagHex, encHex] = parts;
  const key = deriveKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}

export function buildTempPasswordExpiry(): Date {
  return new Date(Date.now() + TEMP_PASSWORD_TTL_MS);
}
